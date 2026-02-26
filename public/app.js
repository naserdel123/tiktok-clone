const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      isAuthenticated: false,
      authMode: 'login',
      token: localStorage.getItem('token'),
      currentUser: null,
      
      loginForm: { username: '', password: '' },
      registerForm: { username: '', email: '', password: '' },
      loggingIn: false,
      registering: false,
      
      currentPage: 'feed',
      navItems: [
        { id: 'feed', name: 'الرئيسية', icon: 'fas fa-home' },
        { id: 'discover', name: 'اكتشف', icon: 'fas fa-compass' },
        { id: 'leaderboard', name: 'المتصدرين', icon: 'fas fa-trophy' },
        { id: 'profile', name: 'أنا', icon: 'fas fa-user' }
      ],
      
      // Content
      feedVideos: [],
      storiesFeed: [],
      suggestedUsers: [],
      leaderboard: [],
      challenges: [],
      notifications: [],
      
      // Search
      searchQuery: '',
      
      // Profile
      viewingProfile: null,
      profileTab: 'videos',
      showEditProfile: false,
      
      // Upload
      showUpload: false,
      selectedVideo: null,
      videoPreview: null,
      uploadCaption: '',
      uploading: false,
      
      // Stories
      showStories: false,
      viewingStory: null,
      storyProgress: 0,
      storyTimer: null,
      
      // Live
      liveModal: false,
      isStreaming: false,
      liveTitle: '',
      cameraReady: false,
      liveViewers: 0,
      liveComments: [],
      liveCommentText: '',
      recentGifts: [],
      showGifts: false,
      availableGifts: [],
      
      // Chat
      showChats: false,
      chats: [],
      activeChat: null,
      chatMessages: [],
      chatInput: '',
      
      // Notifications
      showNotifications: false,
      
      // Socket
      socket: null,
      pc: null
    }
  },

  computed: {
    unseenStories() {
      return this.storiesFeed.filter(s => s.hasUnseen).length;
    },
    unreadChats() {
      return this.chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    },
    unreadNotifications() {
      return this.notifications.filter(n => !n.read).length;
    }
  },

  mounted() {
    setTimeout(() => {
      this.loading = false;
      if (this.token) this.initAuth();
    }, 2000);
  },

  methods: {
    async initAuth() {
      try {
        const res = await fetch('/api/me', {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        if (res.ok) {
          this.currentUser = await res.json();
          this.isAuthenticated = true;
          this.initSocket();
          this.loadAllData();
        } else {
          localStorage.removeItem('token');
        }
      } catch (e) {
        console.error(e);
      }
    },

    initSocket() {
      this.socket = io();
      
      this.socket.on('live-started', (live) => {
        // Handle new live
      });
      
      this.socket.on('viewer-count', (count) => this.liveViewers = count);
      this.socket.on('new-comment', (c) => {
        this.liveComments.push(c);
        if (this.liveComments.length > 50) this.liveComments.shift();
      });
      this.socket.on('gift-received', (g) => {
        this.recentGifts.push(g);
        setTimeout(() => this.recentGifts.shift(), 5000);
      });
      this.socket.on('like-animation', () => {});
      this.socket.on('new-message', (m) => {
        if (this.activeChat && m.senderId === this.activeChat.user.id) {
          this.chatMessages.push(m);
        }
      });
      
      this.socket.emit('join-chat', this.currentUser.id);
    },

    async loadAllData() {
      await Promise.all([
        this.loadFeed(),
        this.loadStories(),
        this.loadSuggested(),
        this.loadLeaderboard(),
        this.loadChallenges(),
        this.loadChats(),
        this.loadNotifications(),
        this.loadGifts()
      ]);
    },

    async handleLogin() {
      this.loggingIn = true;
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.loginForm)
      });
      const data = await res.json();
      if (data.success) {
        this.token = data.token;
        localStorage.setItem('token', this.token);
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.initSocket();
        this.loadAllData();
      } else {
        alert(data.error);
      }
      this.loggingIn = false;
    },

    async handleRegister() {
      this.registering = true;
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.registerForm)
      });
      const data = await res.json();
      if (data.success) {
        this.token = data.token;
        localStorage.setItem('token', this.token);
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.initSocket();
        this.loadAllData();
      } else {
        alert(data.error);
      }
      this.registering = false;
    },

    async loadFeed() {
      const res = await fetch('/api/feed', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.feedVideos = await res.json();
    },

    async loadStories() {
      const res = await fetch('/api/stories/feed', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.storiesFeed = await res.json();
    },

    async loadSuggested() {
      const res = await fetch(`/api/suggested/${this.currentUser.id}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.suggestedUsers = await res.json();
    },

    async loadLeaderboard() {
      const res = await fetch('/api/leaderboard', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.leaderboard = await res.json();
    },

    async loadChallenges() {
      const res = await fetch('/api/challenges', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.challenges = await res.json();
    },

    async loadChats() {
      const res = await fetch('/api/chats', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.chats = await res.json();
    },

    async loadNotifications() {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.notifications = await res.json();
    },

    async loadGifts() {
      const res = await fetch('/api/gifts', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.availableGifts = await res.json();
    },

    navigate(page) {
      this.currentPage = page;
      if (page === 'profile') {
        this.viewingProfile = this.currentUser;
        this.loadProfile(this.currentUser.id);
      }
    },

    async loadProfile(userId) {
      const res = await fetch(`/api/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.viewingProfile = await res.json();
    },

    goToProfile(userId) {
      this.loadProfile(userId);
      this.currentPage = 'profile';
    },

    async followUser(user) {
      const res = await fetch(`/api/follow/${user.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      user.isFollowing = data.following;
      user.followers += data.following ? 1 : -1;
      if (data.reachedGoal) alert('🎉 وصلت 300 متابع!');
    },

    async likeVideo(video) {
      await fetch(`/api/videos/${video.id}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      video.isLiked = !video.isLiked;
      video.likes += video.isLiked ? 1 : -1;
    },

    async saveVideo(video) {
      await fetch(`/api/videos/${video.id}/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      video.isSaved = !video.isSaved;
    },

    shareVideo(video) {
      navigator.clipboard.writeText(`${window.location.origin}/video/${video.id}`);
      alert('تم النسخ!');
    },

    async performSearch() {
      const res = await fetch(`/api/search?q=${this.searchQuery}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      // Handle search results
    },

    // Stories
    addStory() {
      // Open camera for story
    },

    viewStory(story) {
      this.viewingStory = story;
      this.storyProgress = 0;
      const duration = 5000; // 5 seconds per story
      const interval = 50;
      
      this.storyTimer = setInterval(() => {
        this.storyProgress += (interval / duration) * 100;
        if (this.storyProgress >= 100) {
          this.closeStory();
        }
      }, interval);
    },

    closeStory() {
      clearInterval(this.storyTimer);
      this.viewingStory = null;
      this.storyProgress = 0;
    },

    // Upload
    handleVideoSelect(e) {
      this.selectedVideo = e.target.files[0];
      this.videoPreview = URL.createObjectURL(this.selectedVideo);
    },

    async uploadVideo() {
      this.uploading = true;
      const formData = new FormData();
      formData.append('video', this.selectedVideo);
      formData.append('description', this.uploadCaption);
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });
      
      if (res.ok) {
        this.showUpload = false;
        this.loadFeed();
      }
      this.uploading = false;
    },

    // Live
    openLiveModal() {
      if (!this.currentUser.canGoLive) {
        alert('تحتاج 300 متابع');
        return;
      }
      this.liveModal = true;
      this.isStreaming = false;
    },

    async initCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.$refs.previewVideo.srcObject = stream;
      this.cameraReady = true;
    },

    startLive() {
      this.isStreaming = true;
      this.socket.emit('start-live', {
        userId: this.currentUser.id,
        title: this.liveTitle
      });
      this.socket.on('live-ready', ({ liveId }) => {
        this.setupWebRTC(true, liveId);
      });
    },

    endLive() {
      this.socket.emit('end-live');
      this.liveModal = false;
    },

    sendLiveComment() {
      this.socket.emit('live-comment', {
        liveId: this.currentLiveId,
        text: this.liveCommentText,
        userId: this.currentUser.id
      });
      this.liveCommentText = '';
    },

    sendLiveLike() {
      this.socket.emit('live-like', { liveId: this.currentLiveId });
    },

    sendGift(gift) {
      this.socket.emit('send-gift', {
        liveId: this.watchingLive?.id || this.currentLiveId,
        giftId: gift.id,
        userId: this.currentUser.id
      });
      this.showGifts = false;
    },

    // Chat
    startChat(user) {
      this.activeChat = { user };
      this.loadChatMessages(user.id);
      this.showChats = false;
    },

    async loadChatMessages(userId) {
      const res = await fetch(`/api/chats/${userId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.chatMessages = await res.json();
    },

    async sendMessage() {
      if (!this.chatInput.trim()) return;
      
      await fetch(`/api/chats/${this.activeChat.user.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: this.chatInput })
      });
      
      this.chatMessages.push({
        senderId: this.currentUser.id,
        text: this.chatInput,
        createdAt: Date.now()
      });
      
      this.chatInput = '';
    },

    // Helpers
    formatNumber(num) {
      if (!num) return '0';
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    },

    formatTime(timestamp) {
      const diff = Date.now() - timestamp;
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return 'الآن';
      if (minutes < 60) return `${minutes}د`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}س`;
      return `${Math.floor(hours / 24)}ي`;
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

    async setupWebRTC(isStreamer, liveId) {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      if (isStreamer) {
        const stream = this.$refs.previewVideo.srcObject;
        stream.getTracks().forEach(t => this.pc.addTrack(t, stream));
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.socket.emit('offer', { liveId, offer });
        this.$refs.liveVideo.srcObject = stream;
      }
      
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.socket.emit('ice-candidate', { liveId, candidate: e.candidate });
        }
      };
    }
  }
}).mount('#app');
