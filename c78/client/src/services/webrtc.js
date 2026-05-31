class WebRTCService {
  constructor() {
    this.peerConnection = null
    this.localStream = null
    this.remoteStream = null
    this.onRemoteStream = null
    this.onIceCandidate = null
    this.configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  }

  async initialize() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      })
      return this.localStream
    } catch (error) {
      console.error('Failed to get user media:', error)
      throw error
    }
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.configuration)

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream)
      })
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate)
      }
    }

    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0]
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream)
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState)
    }

    return this.peerConnection
  }

  async createOffer() {
    if (!this.peerConnection) {
      this.createPeerConnection()
    }
    
    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)
    return offer
  }

  async setOffer(offer) {
    if (!this.peerConnection) {
      this.createPeerConnection()
    }
    
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
  }

  async createAnswer() {
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)
    return answer
  }

  async setAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
  }

  async addIceCandidate(candidate) {
    if (this.peerConnection && candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  close() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
    
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
    
    this.remoteStream = null
  }
}

export default new WebRTCService()
