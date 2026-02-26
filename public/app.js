const { createApp } = Vue;

createApp({
  data() {
    return {
      // Loading & Auth
      loading: true,
      isAuthenticated: false,
      authMode: 'login',
      token: localStorage.getItem('token') || null,
      currentUser: null,
      
      // Forms
      loginForm: { username: '', password: '' },
      registerForm: { username: '', email: '', password: '' },
      loggingIn: false,
      registering: false,
      
      // Navigation
      currentPage: 'feed',
      navItems: [
        { id: 'feed', name: 'الرئيسية', icon: 'fas fa-home' },
        { id: 'discover', name: 'اكتشف', icon: 'fas fa-compass' },
        { id: 'leaderboard', name: 'المتصدرين', icon: 'fas fa-trophy' },
        { id: 'profile', name: 'أنا', icon: 'fas fa-user' }
      ],
      
      // Content
      feedVideos: [],
      suggestedUsers: [],
      leaderboard: [],
      notifications: [],
      chats: [],
      
      // Search
      searchQuery: '',
      
      // Profile
      viewingProfile: null,
      profileTab: 'videos',
      
      // Upload
      showUpload: false,
      selectedVideo: null,
      videoPreview: null,
      uploadCaption: '',
      uploading: false,
      
      // Live
      liveModal: false,
      isStreaming: false,
      liveTitle: '',
      cameraReady: false,
      
      // Chat
      showChats: false,
      activeChat: null,
      chatMessages: [],
      chatInput: '',
      
      // Notifications
      showNotifications: false,
      
      // Socket
      socket: null
    }
  },

  computed: {
    unreadNotifications() {
      return this.notifications.filter(n => !n.read).length;
    },
    unreadChats() {
      return this.chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    }
  },

  mounted() {
    // Check auth after a short delay for splash
    setTimeout(() => {
      this.loading = false;
      if (this.token) {
        this.initAuth();
      }
    }, 1500);
  },

  methods: {
    // Initialize auth
    async initAuth() {
      try {
        const res = await fetch('/api/me', {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data;
          this.isAuthenticated = true;
          this.initSocket();
          this.loadAllData();
        } else {
          // Token invalid
          localStorage.removeItem('token');
          this.token = null;
        }
      } catch (err) {
        console.error('Auth error:', err);
        localStorage.removeItem('token');
        this.token = null;
      }
    },

    // Initialize socket
    initSocket() {
      try {
        this.socket = io();
        
        this.socket.on('connect', () => {
          console.log('Socket connected');
          this.socket.emit('join-chat', this.currentUser.id);
        });
        
        this.socket.on('new-message', (msg) => {
          if (this.activeChat && msg.senderId === this.activeChat.user.id) {
            this.chatMessages.push(msg);
          }
        });
      } catch (err) {
        console.error('Socket error:', err);
      }
    },

    // Load all data
    async loadAllData() {
      try {
        await Promise.all([
          this.loadFeed(),
          this.loadSuggested(),
          this.loadLeaderboard(),
          this.loadChats(),
          this.loadNotifications()
        ]);
      } catch (err) {
        console.error('Load data error:', err);
      }
    },

    // Auth methods
    async handleLogin() {
      if (!this.loginForm.username || !this.loginForm.password) {
        alert('يرجى ملء جميع الحقول');
        return;
      }
      
      this.loggingIn = true;
      try {
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
          alert(data.error || 'خطأ في تسجيل الدخول');
        }
      } catch (err) {
        alert('خطأ في الاتصال');
      } finally {
        this.loggingIn = false;
      }
    },

    async handleRegister() {
      if (!this.registerForm.username || !this.registerForm.email || !this.registerForm.password) {
        alert('يرجى ملء جميع الحقول');
        return;
      }
      
      this.registering = true;
      try {
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
          alert(data.error || 'خطأ في إنشاء الحساب');
        }
      } catch (err) {
        alert('خطأ في الاتصال');
      } finally {
        this.registering = false;
      }
    },

    // Data loading
    async loadFeed() {
      const res = await fetch('/api/feed', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.feedVideos = await res.json();
      }
    },

    async loadSuggested() {
      const res = await fetch(`/api/suggested/${this.currentUser.id}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.suggestedUsers = await res.json();
      }
    },

    async loadLeaderboard() {
      const res = await fetch('/api/leaderboard', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.leaderboard = await res.json();
      }
    },

    async loadChats() {
      const res = await fetch('/api/chats', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.chats = await res.json();
      }
    },

    async loadNotifications() {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.notifications = await res.json();
      }
    },

    // Navigation
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
      if (res.ok) {
        this.viewingProfile = await res.json();
      }
    },

    goToProfile(userId) {
      this.loadProfile(userId);
      this.currentPage = 'profile';
    },

    // Actions
    async followUser(user) {
      const res = await fetch(`/api/follow/${user.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        user.isFollowing = data.following;
        user.followers += data.following ? 1 : -1;
        
        if (data.reachedGoal) {
          alert('🎉 وصلت 300 متابع! يمكنك البث الآن');
        }
      }
    },

    async likeVideo(video) {
      const res = await fetch(`/api/videos/${video.id}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        video.isLiked = data.liked;
        video.likes = data.likes;
      }
    },

    async saveVideo(video) {
      const res = await fetch(`/api/videos/${video.id}/save`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        video.isSaved = data.saved;
      }
    },

    // Upload
    handleVideoSelect(e) {
      const file = e.target.files[0];
      if (file) {
        this.selectedVideo = file;
        this.videoPreview = URL.createObjectURL(file);
      }
    },

    async uploadVideo() {
      if (!this.selectedVideo) return;
      
      this.uploading = true;
      const formData = new FormData();
      formData.append('video', this.selectedVideo);
      formData.append('description', this.uploadCaption);
      
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
          body: formData
        });
        
        if (res.ok) {
          this.showUpload = false;
          this.selectedVideo = null;
          this.videoPreview = null;
          this.uploadCaption = '';
          this.loadFeed();
        } else {
          alert('فشل في رفع الفيديو');
        }
      } catch (err) {
        alert('خطأ في الاتصال');
      } finally {
        this.uploading = false;
      }
    },

    // Live
    openLiveModal() {
      if (!this.currentUser.canGoLive) {
        alert('تحتاج 300 متابع للبث المباشر');
        return;
      }
      this.liveModal = true;
      this.isStreaming = false;
      this.liveTitle = '';
      this.cameraReady = false;
    },

    async initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        this.$refs.previewVideo.srcObject = stream;
        this.cameraReady = true;
      } catch (err) {
        alert('لا يمكن الوصول للكاميرا');
      }
    },

    startLive() {
      // Start live streaming
      this.isStreaming = true;
      // Implementation continues...
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
      if (res.ok) {
        this.chatMessages = await res.json();
      }
    },

    async sendMessage() {
      if (!this.chatInput.trim() || !this.activeChat) return;
      
      const res = await fetch(`/api/chats/${this.activeChat.user.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: this.chatInput })
      });
      
      if (res.ok) {
        this.chatMessages.push({
          senderId: this.currentUser.id,
          text: this.chatInput,
          createdAt: Date.now()
        });
        this.chatInput = '';
      }
    },

    openChat(chat) {
      this.activeChat = chat;
      this.loadChatMessages(chat.user.id);
    },

    // Helpers
    formatNumber(num) {
      if (!num) return '0';
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    },

    togglePlay(video) {
      // Toggle video play/pause
    },

    performSearch() {
      // Search implementation
    },

    playVideo(video) {
      // Play video implementation
    }
  }
}).mount('#app');
