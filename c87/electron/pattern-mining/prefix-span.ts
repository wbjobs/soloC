
export interface Pattern {
  sequence: string[];
  support: number;
  frequency: number;
  confidence?: number;
}

interface ProjectedDatabase {
  prefix: string[];
  sequences: number[][];
}

class PrefixSpan {
  private sequences: string[][];
  private minSupport: number;
  private maxPatternLength: number;
  private itemToId: Map<string, number>;
  private idToItem: Map<number, string>;

  constructor(sequences: string[][], minSupport: number = 0.01, maxPatternLength: number = 10) {
    this.sequences = sequences;
    this.minSupport = Math.max(1, Math.floor(minSupport * sequences.length));
    this.maxPatternLength = maxPatternLength;
    this.itemToId = new Map();
    this.idToItem = new Map();
  }

  private encodeSequences(): number[][] {
    let nextId = 0;
    const encoded: number[][] = [];

    for (const sequence of this.sequences) {
      const seq: number[] = [];
      for (const item of sequence) {
        if (!this.itemToId.has(item)) {
          this.itemToId.set(item, nextId);
          this.idToItem.set(nextId, item);
          nextId++;
        }
        seq.push(this.itemToId.get(item)!);
      }
      if (seq.length > 0) {
        encoded.push(seq);
      }
    }

    return encoded;
  }

  private findFrequentItems(sequences: number[][], prefix: number[]): Map<number, number> {
    const itemCounts = new Map<number, number>();

    for (const sequence of sequences) {
      const foundItems = new Set<number>();
      let startIdx = 0;

      if (prefix.length > 0) {
        for (let i = 0; i < sequence.length; i++) {
          let match = true;
          for (let j = 0; j < prefix.length && i + j < sequence.length; j++) {
            if (sequence[i + j] !== prefix[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            startIdx = i + prefix.length;
            break;
          }
        }
      }

      for (let i = startIdx; i < sequence.length; i++) {
        foundItems.add(sequence[i]);
      }

      for (const item of foundItems) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    return itemCounts;
  }

  private projectDatabase(sequences: number[][], prefix: number[], item: number): number[][] {
    const projected: number[][] = [];

    for (const sequence of sequences) {
      let startIdx = -1;

      for (let i = 0; i < sequence.length; i++) {
        let match = true;
        for (let j = 0; j < prefix.length && i + j < sequence.length; j++) {
          if (sequence[i + j] !== prefix[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          for (let j = i + prefix.length; j < sequence.length; j++) {
            if (sequence[j] === item) {
              startIdx = j + 1;
              break;
            }
          }
          break;
        }
      }

      if (startIdx >= 0 && startIdx < sequence.length) {
        projected.push(sequence.slice(startIdx));
      }
    }

    return projected;
  }

  private prefixSpanRecursive(
    prefix: number[],
    sequences: number[][],
    results: Pattern[]
  ): void {
    if (prefix.length >= this.maxPatternLength) {
      return;
    }

    const frequentItems = this.findFrequentItems(sequences, prefix);

    for (const [item, count] of frequentItems) {
      if (count < this.minSupport) {
        continue;
      }

      const newPrefix = [...prefix, item];
      const newPrefixStr = newPrefix.map(id => this.idToItem.get(id)!);

      results.push({
        sequence: newPrefixStr,
        support: count,
        frequency: count / this.sequences.length
      });

      const projected = this.projectDatabase(sequences, prefix, item);
      if (projected.length > 0) {
        this.prefixSpanRecursive(newPrefix, projected, results);
      }
    }
  }

  mine(): Pattern[] {
    const encoded = this.encodeSequences();
    const results: Pattern[] = [];

    this.prefixSpanRecursive([], encoded, results);

    results.sort((a, b) => b.support - a.support);

    return results;
  }
}

export { PrefixSpan };
