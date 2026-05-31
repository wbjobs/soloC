import { AlertMessage } from '../types';

let currentMetrics: any = null;
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
const alerts: AlertMessage[] = [];
const MAX_ALERTS = 50;

const injectedTabs = new Set<number>();
const WS_URL = 'ws://localhost:3001';

function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message: AlertMessage = JSON.parse(event.data);
        if (message.type === 'ALERT') {
          addAlert(message);
          broadcastAlertToPopup(message);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s...');
      scheduleReconnect();
    };
  } catch (e) {
    console.error('Failed to connect WebSocket:', e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectWebSocket();
    }, 3000);
  }
}

function addAlert(alert: AlertMessage) {
  alerts.unshift(alert);
  if (alerts.length > MAX_ALERTS) {
    alerts.pop();
  }
}

function broadcastAlertToPopup(alert: AlertMessage) {
  chrome.runtime.sendMessage({
    type: 'NEW_ALERT',
    data: alert
  }).catch(() => {});
}

async function injectContentScript(tabId: number) {
  if (injectedTabs.has(tabId)) return;
  
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: false },
      files: ['content.js']
    });
    injectedTabs.add(tabId);
  } catch (e) {
    console.warn('Failed to inject content script:', e);
  }
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    injectedTabs.delete(details.tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    injectContentScript(tabId);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'METRICS_UPDATE') {
    currentMetrics = request.data;
  }
  if (request.type === 'GET_CURRENT_METRICS') {
    sendResponse(currentMetrics);
  }
  if (request.type === 'GET_ALERTS') {
    sendResponse(alerts);
  }
  if (request.type === 'CLEAR_ALERTS') {
    alerts.length = 0;
    sendResponse({ success: true });
  }
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
    await injectContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'GET_METRICS' }).catch(() => {});
  }
});

connectWebSocket();

export {};
