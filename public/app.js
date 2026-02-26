const { createApp } = Vue;

createApp({
  data() {
    return {
      appReady: false,
      currentUser: null,
      loginUsername: '',
      loggingIn: false,
      authError: false,
      inputFocused: false,
      
      socket: null,
      activeTab: 'feed',
      tabs: [
        { id: 'feed', name: 'الرئيسية', icon: 'fas fa-home' },
        { id: 'discover', name: 'اكتشف', icon: 'fas fa-compass' },
        { id: 'leaderboard', name: 'المتصدرين', icon: 'fas fa-trophy' }
      ],
      
      videos: [],
      suggestedUsers: [],
      leaderboard: [],
      searchQuery: '',
      
      showProfile: false,
      showLiveModal: false,
      liveStage: 'prep',
      liveTitle: '',
      cameraReady: false,
      liveViewers: 0,
      liveComments: [],
      liveCommentText: '',
      
      activeLives: [],
      showLivesList: false,
      watchingLive: null,
      watchCommentText: '',
      
      showCelebration: false,
      toasts: [],
      toastId: 0
    }
  },

  computed: {
    progressPercent() {
      if (!this.currentUser) return 0;
      return Math.min((this.currentUser.followers / 300) * 100, 100);
    }
  },

  mounted() {
    // Splash screen
    setTimeout(() => {
      this.appReady = true;
      this.initParticles();
    }, 2000);
    
    // Check saved user
    const saved = localStorage.getItem('tiktok_user');
    if (saved) {
      this.currentUser = JSON.parse(saved);
      this.initSocket();
      this.loadData();
    }
  },

  methods: {
    initParticles() {
      const container = document.getElementById('particles');
      if (!container) return;
      
      for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(particle);
      }
    },

    magneticMove(e) {
      const btn = e.currentTarget;
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    },

    magneticReset(e) {
      e.currentTarget.style.transform = 'translate(0, 0)';
    },

    async login() {
      if (!this.loginUsername.trim()) return;
      
      this.loggingIn = true;
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.loginUsername })
        });
        
        const data = await res.json();
        this.currentUser = data.user;
        localStorage.setItem('tiktok_user', JSON.stringify(this.currentUser));
        
        this.initSocket();
        this.loadData();
      } catch (e) {
        this.authError = true;
        setTimeout(() => this.authError = false, 500);
        this.showToast('خطأ في الدخول', 'error');
      } finally {
        this.loggingIn = false;
      }
    },

    initSocket() {
      this.socket = io();
      
      this.socket.on('live-started', (live) => {
        this.activeLives.push(live);
        this.showToast(`🔴 @${live.user.username} يبث الآن!`, 'info');
      });
      
      this.socket.on('live-ended', () => {
        if (this.watchingLive) {
          this.stopWatching();
        }
      });
      
      this.socket.on('viewer-count', (count) => {
        this.liveViewers = count;
      });
      
      this.socket.on('new-comment', (comment) => {
        this.liveComments.push(comment);
        if (this.liveComments.length > 50) {
          this.liveComments.shift();
        }
      });
      
      this.socket.on('like-animation', () => {
        this.createLikeAnimation();
      });
      
      // WebRTC signaling
      this.socket.on('offer', (offer) => this.handleOffer(offer));
      this.socket.on('answer', (answer) => this.handleAnswer(answer));
      this.socket.on('ice-candidate', (candidate) => this.handleIceCandidate(candidate));
    },

    async loadData() {
      await Promise.all([
        this.loadVideos(),
        this.loadSuggested(),
        this.loadLeaderboard()
      ]);
    },

    async loadVideos() {
      const res = await fetch('/api/videos');
      this.videos = await res.json();
    },

    async loadSuggested() {
      const res = await fetch(`/api/suggested/${this.currentUser.id}`);
      this.suggestedUsers = await res.json();
    },

    async loadLeaderboard() {
      const res = await fetch('/api/leaderboard');
      this.leaderboard = await res.json();
    },

    async searchUsers() {
      // Debounced search
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(async () => {
        if (!this.searchQuery.trim()) return;
        // Implement search
      }, 300);
    },

    async followUser(user) {
      try {
        const res = await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerId: this.currentUser.id,
            followingId: user.id
          })
        });
        
        const data = await res.json();
        
        this.currentUser.following++;
        user.followers++;
        
        if (data.reachedGoal) {
          this.currentUser.canGoLive = true;
          this.showCelebration = true;
          this.createFireworks();
        }
        
        this.showToast(`تابعت @${user.username}`, 'success');
        this.loadSuggested();
        this.loadLeaderboard();
        
      } catch (e) {
        this.showToast('خطأ في المتابعة', 'error');
      }
    },

    isFollowing(userId) {
      return false; // Simplified
    },

    togglePlay(video) {
      const el = document.querySelector(`video[src="${video.url}"]`);
      if (el.paused) {
        el.play();
        video.playing = true;
      } else {
        el.pause();
        video.playing = false;
      }
    },

    async likeVideo(video) {
      await fetch(`/api/videos/${video.id}/like`, { method: 'POST' });
      video.likes++;
      video.liked = true;
    },

    shareVideo(video) {
      navigator.clipboard.writeText(window.location.href);
      this.showToast('تم نسخ الرابط', 'success');
    },

    formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    },

    // Live Streaming
    prepareLive() {
      if (!this.currentUser.canGoLive) {
        this.showToast('تحتاج 300 متابع للبث', 'error');
        return;
      }
      this.showLiveModal = true;
      this.liveStage = 'prep';
      this.liveTitle = '';
      this.cameraReady = false;
    },

    async initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' }, 
          audio: true 
        });
        this.$refs.previewVideo.srcObject = stream;
        this.cameraReady = true;
      } catch (e) {
        this.showToast('لا يمكن الوصول للكاميرا', 'error');
      }
    },

    startLive() {
      this.liveStage = 'streaming';
      this.socket.emit('start-live', {
        userId: this.currentUser.id,
        title: this.liveTitle
      });
      
      this.socket.on('live-ready', ({ liveId }) => {
        this.currentLiveId = liveId;
        this.setupWebRTC(true);
      });
    },

    endLive() {
      this.socket.emit('end-live', { liveId: this.currentLiveId });
      this.showLiveModal = false;
      this.liveStage = 'prep';
      
      const stream = this.$refs.liveVideo.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    },

    sendComment() {
      if (!this.liveCommentText.trim()) return;
      
      this.socket.emit('live-comment', {
        liveId: this.currentLiveId,
        text: this.liveCommentText,
        username: this.currentUser.username
      });
      
      this.liveCommentText = '';
    },

    sendLike() {
      this.socket.emit('live-like', { liveId: this.currentLiveId });
      this.createLikeAnimation();
    },

    createLikeAnimation() {
      const container = this.$refs.likesContainer;
      if (!container) return;
      
      const like = document.createElement('div');
      like.className = 'like-float';
      like.textContent = '❤️';
      like.style.left = Math.random() * 50 + 'px';
      container.appendChild(like);
      
      setTimeout(() => like.remove(), 2000);
    },

    // Watch Live
    joinLive(live) {
      this.watchingLive = live;
      this.showLivesList = false;
      
      this.socket.emit('join-live', {
        liveId: live.id,
        userId: this.currentUser.id
      });
      
      this.setupWebRTC(false);
    },

    stopWatching() {
      this.watchingLive = null;
    },

    sendWatchComment() {
      if (!this.watchCommentText.trim()) return;
      // Send comment
      this.watchCommentText = '';
    },

    sendWatchLike() {
      this.socket.emit('live-like', { liveId: this.watchingLive.id });
    },

    // WebRTC
    async setupWebRTC(isStreamer) {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      if (isStreamer) {
        const stream = this.$refs.previewVideo.srcObject;
        stream.getTracks().forEach(track => {
          this.pc.addTrack(track, stream);
        });
        
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.socket.emit('offer', { liveId: this.currentLiveId, offer });
      } else {
        this.pc.ontrack = (e) => {
          this.$refs.watchVideo.srcObject = e.streams[0];
        };
      }
      
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.socket.emit('ice-candidate', {
            liveId: isStreamer ? this.currentLiveId : this.watchingLive.id,
            candidate: e.candidate
          });
        }
      };
    },

    async handleOffer(offer) {
      if (!this.watchingLive) return;
      
      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      this.socket.emit('answer', {
        liveId: this.watchingLive.id,
        answer
      });
    },

    async handleAnswer(answer) {
      await this.pc.setRemoteDescription(answer);
    },

    async handleIceCandidate(candidate) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    },

    // Celebration
    createFireworks() {
      const container = document.getElementById('fireworks');
      if (!container) return;
      
      const colors = ['#ff0040', '#00ff80', '#ffed4e', '#00d4ff', '#ff00ff'];
      
      for (let i = 0; i < 50; i++) {
        setTimeout(() => {
          const firework = document.createElement('div');
          firework.className = 'firework';
          firework.style.left = Math.random() * 100 + '%';
          firework.style.top = Math.random() * 100 + '%';
          firework.style.background = colors[Math.floor(Math.random() * colors.length)];
          firework.style.setProperty('--x', (Math.random() - 0.5) * 200 + 'px');
          firework.style.setProperty('--y', (Math.random() - 0.5) * 200 + 'px');
          container.appendChild(firework);
          
          setTimeout(() => firework.remove(), 1000);
        }, i * 50);
      }
    },

    closeCelebration() {
      this.showCelebration = false;
      this.prepareLive();
    },

    // Toast
    showToast(message, type = 'info') {
      const id = ++this.toastId;
      const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle'
      };
      
      this.toasts.push({ id, message, type, icon: icons[type] });
      
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 3000);
    },

    logout() {
      localStorage.removeItem('tiktok_user');
      location.reload();
    }
  }
}).mount('#app');
