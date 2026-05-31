from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import aiofiles
import os
import subprocess
import tempfile
import pysam
import hashlib
import json
import redis
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional

load_dotenv()

app = FastAPI(title="Genome Alignment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

CACHE_EXPIRE_SECONDS = int(os.getenv("CACHE_EXPIRE_SECONDS", 86400))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CACHE_KEY_PREFIX = "genome_alignment:"

class AlignmentCache:
    def __init__(self, redis_url: str = REDIS_URL):
        self.redis_client: Optional[redis.Redis] = None
        self.redis_url = redis_url
        self._connect()

    def _connect(self) -> None:
        try:
            self.redis_client = redis.Redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            self.redis_client.ping()
            print("Redis cache connected successfully")
        except Exception as e:
            print(f"Warning: Redis connection failed - {e}. Caching will be disabled.")
            self.redis_client = None

    def _generate_cache_key(self, ref_hash: str, query_hash: str) -> str:
        combined_hash = hashlib.sha256(f"{ref_hash}:{query_hash}".encode()).hexdigest()
        return f"{CACHE_KEY_PREFIX}{combined_hash}"

    def compute_file_hash(self, file_path: str) -> str:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(8192), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def get(self, ref_hash: str, query_hash: str) -> Optional[Dict[str, Any]]:
        if not self.redis_client:
            return None
        try:
            cache_key = self._generate_cache_key(ref_hash, query_hash)
            cached_data = self.redis_client.get(cache_key)
            if cached_data:
                print(f"Cache hit for key: {cache_key}")
                return json.loads(cached_data)
            return None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None

    def set(self, ref_hash: str, query_hash: str, result: Dict[str, Any]) -> bool:
        if not self.redis_client:
            return False
        try:
            cache_key = self._generate_cache_key(ref_hash, query_hash)
            serialized_data = json.dumps(result)
            self.redis_client.setex(cache_key, CACHE_EXPIRE_SECONDS, serialized_data)
            print(f"Cache set for key: {cache_key}, expire: {CACHE_EXPIRE_SECONDS}s")
            return True
        except Exception as e:
            print(f"Cache set error: {e}")
            return False

    def clear(self) -> None:
        if not self.redis_client:
            return
        try:
            keys = self.redis_client.keys(f"{CACHE_KEY_PREFIX}*")
            if keys:
                self.redis_client.delete(*keys)
                print(f"Cleared {len(keys)} cached entries")
        except Exception as e:
            print(f"Cache clear error: {e}")

    def get_stats(self) -> Dict[str, Any]:
        if not self.redis_client:
            return {"enabled": False}
        try:
            keys = self.redis_client.keys(f"{CACHE_KEY_PREFIX}*")
            return {
                "enabled": True,
                "cached_entries": len(keys),
                "expire_seconds": CACHE_EXPIRE_SECONDS
            }
        except Exception as e:
            print(f"Cache stats error: {e}")
            return {"enabled": False, "error": str(e)}

alignment_cache = AlignmentCache()


def parse_cigar(cigar_tuple: tuple) -> List[Dict[str, Any]]:
    operations = []
    op_map = {0: "M", 1: "I", 2: "D", 3: "N", 4: "S", 5: "H", 6: "P"}
    for op, length in cigar_tuple:
        operations.append({"type": op_map.get(op, "?"), "length": length})
    return operations


def parse_md_tag(md_tag: str) -> List[Dict[str, Any]]:
    mismatches = []
    current_pos = 0
    i = 0
    while i < len(md_tag):
        if md_tag[i].isdigit():
            j = i
            while j < len(md_tag) and md_tag[j].isdigit():
                j += 1
            match_len = int(md_tag[i:j])
            current_pos += match_len
            i = j
        elif md_tag[i] == "^":
            i += 1
            del_seq = ""
            while i < len(md_tag) and md_tag[i].isalpha():
                del_seq += md_tag[i]
                i += 1
            mismatches.append({"type": "deletion", "pos": current_pos, "seq": del_seq})
            current_pos += len(del_seq)
        elif md_tag[i].isalpha():
            mismatches.append({"type": "mismatch", "pos": current_pos, "ref_base": md_tag[i]})
            current_pos += 1
            i += 1
    return mismatches


def read_fasta(file_path: str) -> Dict[str, str]:
    sequences = {}
    current_seq = ""
    current_name = ""
    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if line.startswith(">"):
                if current_name:
                    sequences[current_name] = current_seq
                current_name = line[1:].split()[0]
                current_seq = ""
            else:
                current_seq += line.upper()
        if current_name:
            sequences[current_name] = current_seq
    return sequences


async def save_uploaded_file(file: UploadFile) -> str:
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    return file_path


def run_minimap2(ref_path: str, query_path: str, output_sam: str) -> bool:
    try:
        cmd = ["minimap2", "-ax", "sr", ref_path, query_path, "-o", output_sam]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return result.returncode == 0
    except Exception:
        return False


def sam_to_bam(sam_path: str, bam_path: str) -> bool:
    try:
        pysam.view("-bS", sam_path, "-o", bam_path, catch_stdout=False)
        pysam.sort("-o", bam_path, bam_path, catch_stdout=False)
        pysam.index(bam_path, catch_stdout=False)
        return True
    except Exception:
        return False


def parse_alignment(bam_path: str, ref_path: str) -> Dict[str, Any]:
    ref_sequences = read_fasta(ref_path)
    alignments = []
    
    bam = pysam.AlignmentFile(bam_path, "rb")
    
    for read in bam.fetch():
        if read.is_unmapped:
            continue
            
        alignment = {
            "query_name": read.query_name,
            "reference_name": bam.get_reference_name(read.reference_id),
            "reference_start": read.reference_start,
            "reference_end": read.reference_end,
            "mapping_quality": read.mapping_quality,
            "cigar": parse_cigar(read.cigartuples) if read.cigartuples else [],
            "query_sequence": read.query_sequence,
            "query_qualities": [ord(q) - 33 for q in read.qual] if read.qual else [],
            "is_reverse": read.is_reverse,
            "is_secondary": read.is_secondary,
            "is_supplementary": read.is_supplementary,
        }
        
        if read.has_tag("MD"):
            alignment["mismatches"] = parse_md_tag(read.get_tag("MD"))
        
        alignments.append(alignment)
    
    bam.close()
    
    return {
        "reference_sequences": ref_sequences,
        "alignments": alignments,
        "total_reads": len(alignments)
    }


@app.post("/api/align")
async def align_sequences(
    reference: UploadFile = File(...),
    query: UploadFile = File(...)
):
    ref_path = None
    query_path = None
    sam_path = None
    bam_path = None
    
    try:
        ref_path = await save_uploaded_file(reference)
        query_path = await save_uploaded_file(query)
        
        ref_hash = alignment_cache.compute_file_hash(ref_path)
        query_hash = alignment_cache.compute_file_hash(query_path)
        
        cached_result = alignment_cache.get(ref_hash, query_hash)
        if cached_result:
            return JSONResponse(content={
                "success": True,
                "data": cached_result,
                "from_cache": True
            })
        
        with tempfile.NamedTemporaryFile(suffix=".sam", delete=False) as sam_tmp:
            sam_path = sam_tmp.name
        with tempfile.NamedTemporaryFile(suffix=".bam", delete=False) as bam_tmp:
            bam_path = bam_tmp.name
        
        minimap2_success = run_minimap2(ref_path, query_path, sam_path)
        if not minimap2_success:
            raise HTTPException(status_code=500, detail="minimap2 alignment failed")
        
        bam_success = sam_to_bam(sam_path, bam_path)
        if not bam_success:
            raise HTTPException(status_code=500, detail="SAM to BAM conversion failed")
        
        result = parse_alignment(bam_path, ref_path)
        
        alignment_cache.set(ref_hash, query_hash, result)
        
        return JSONResponse(content={
            "success": True,
            "data": result,
            "from_cache": False
        })
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        for path in [sam_path, bam_path, ref_path, query_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except:
                    pass


@app.delete("/api/cache")
async def clear_cache():
    alignment_cache.clear()
    return {"success": True, "message": "Cache cleared successfully"}


@app.get("/api/cache/stats")
async def cache_stats():
    return {"success": True, "data": alignment_cache.get_stats()}


@app.get("/api/health")
async def health_check():
    cache_stats = alignment_cache.get_stats()
    return {
        "status": "healthy",
        "cache": cache_stats
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
