const API_BASE_URL = '/api/v1';

class TournamentAPI {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = localStorage.getItem('token');
  }

  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async _request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: this._getHeaders(),
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || '请求失败');
    }

    return result.data;
  }

  login(username, password) {
    return this._request('POST', '/login', { username, password });
  }

  checkAuth() {
    return this._request('GET', '/check-auth');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async getAllEvents() {
    return this._request('GET', '/tournaments');
  }

  async getEventById(eventId) {
    return this._request('GET', `/tournaments/${eventId}`);
  }

  async createEvent(eventData) {
    return this._request('POST', '/tournaments', eventData);
  }

  async updateEvent(eventId, eventData) {
    return this._request('PUT', `/tournaments/${eventId}`, eventData);
  }

  async deleteEvent(eventId) {
    return this._request('DELETE', `/tournaments/${eventId}`);
  }

  async getStagesByEvent(eventId) {
    return this._request('GET', `/tournaments/${eventId}/stages`);
  }

  async createStage(stageData) {
    return this._request('POST', '/stages', stageData);
  }

  async getParticipantsByEvent(eventId) {
    return this._request('GET', `/tournaments/${eventId}/participants`);
  }

  async createParticipants(eventId, participants) {
    return this._request('POST', `/tournaments/${eventId}/participants`, participants);
  }

  async createBracket(eventId, categoryId, participants, type = 'single_elimination') {
    return this._request('POST', '/brackets', { eventId, categoryId, participants, type });
  }

  async getBracketByEvent(eventId) {
    return this._request('GET', `/tournaments/${eventId}/brackets`);
  }

  async updateMatchResult(matchId, winnerId) {
    return this._request('PUT', `/matches/${matchId}/result`, { winnerId });
  }

  async exportEventToExcel(eventId) {
    const url = `${this.baseUrl}/export/events/${eventId}/excel`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this._getHeaders(),
    });

    if (!response.ok) {
      throw new Error('导出失败');
    }

    const blob = await response.blob();
    return blob;
  }
}

const api = new TournamentAPI();

if (typeof window !== 'undefined') {
  window.api = api;
}

module.exports = api;