import express from 'express'
import cors from 'cors'
import { createHelia } from 'helia'
import { createOrbitDB } from '@orbitdb/core'
import { LevelBlockstore } from 'blockstore-level'
import { LevelDatastore } from 'datastore-level'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

let helia
let orbitdb
const databases = new Map()

async function initIPFS() {
  try {
    const blockstore = new LevelBlockstore('./data/blocks')
    const datastore = new LevelDatastore('./data/data')
    
    helia = await createHelia({
      blockstore,
      datastore
    })
    
    orbitdb = await createOrbitDB({ ipfs: helia })
    
    console.log('IPFS node started')
    console.log('Peer ID:', helia.libp2p.peerId.toString())
  } catch (error) {
    console.error('Failed to initialize IPFS:', error)
  }
}

app.get('/api/room/create', async (req, res) => {
  try {
    const db = await orbitdb.open('whiteboard-' + Date.now(), { type: 'documents' })
    await db.add({ type: 'init', timestamp: Date.now() })
    
    databases.set(db.address.toString(), db)
    
    res.json({ 
      cid: db.address.toString(),
      success: true
    })
  } catch (error) {
    console.error('Error creating room:', error)
    res.status(500).json({ error: 'Failed to create room' })
  }
})

app.get('/api/room/:cid', async (req, res) => {
  try {
    const { cid } = req.params
    
    if (!databases.has(cid)) {
      const db = await orbitdb.open(cid)
      databases.set(cid, db)
    }
    
    const db = databases.get(cid)
    const records = await db.all()
    
    res.json({ 
      records,
      success: true
    })
  } catch (error) {
    console.error('Error joining room:', error)
    res.status(500).json({ error: 'Failed to join room' })
  }
})

app.post('/api/room/:cid/sync', async (req, res) => {
  try {
    const { cid } = req.params
    const { operations } = req.body
    
    if (!databases.has(cid)) {
      const db = await orbitdb.open(cid)
      databases.set(cid, db)
    }
    
    const db = databases.get(cid)
    
    for (const op of operations) {
      await db.add(op)
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error syncing:', error)
    res.status(500).json({ error: 'Failed to sync' })
  }
})

app.get('/api/room/:cid/history', async (req, res) => {
  try {
    const { cid } = req.params
    
    if (!databases.has(cid)) {
      const db = await orbitdb.open(cid)
      databases.set(cid, db)
    }
    
    const db = databases.get(cid)
    const records = await db.all()
    
    const history = records
      .sort((a, b) => a.value.timestamp - b.value.timestamp)
      .map(r => ({
        hash: r.hash,
        timestamp: r.value.timestamp,
        operation: r.value
      }))
    
    res.json({ 
      history,
      success: true
    })
  } catch (error) {
    console.error('Error getting history:', error)
    res.status(500).json({ error: 'Failed to get history' })
  }
})

initIPFS().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
})