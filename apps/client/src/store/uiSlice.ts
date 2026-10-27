import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { logout } from './authSlice.js';

export interface UiNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface UiState {
  isSidebarOpen: boolean;
  isMobileDrawerOpen: boolean;
  isProfileModalOpen: boolean;
  notifications: UiNotification[];
}

export const initialUiState: UiState = {
  isSidebarOpen: true,
  isMobileDrawerOpen: false,
  isProfileModalOpen: false,
  notifications: [],
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState: initialUiState,
  reducers: {
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    toggleMobileDrawer: (state) => {
      state.isMobileDrawerOpen = !state.isMobileDrawerOpen;
    },
    setMobileDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.isMobileDrawerOpen = action.payload;
    },
    openProfileModal: (state) => {
      state.isProfileModalOpen = true;
    },
    closeProfileModal: (state) => {
      state.isProfileModalOpen = false;
    },
    addNotification: (
      state,
      action: PayloadAction<{
        id?: string;
        type: 'info' | 'success' | 'warning' | 'error';
        message: string;
      }>
    ) => {
      const id = action.payload.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      state.notifications.push({
        id,
        type: action.payload.type,
        message: action.payload.message,
      });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter((n) => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => {
      return {
        ...initialUiState,
        isProfileModalOpen: false,
        isMobileDrawerOpen: false,
        notifications: [],
      };
    });
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  toggleMobileDrawer,
  setMobileDrawerOpen,
  openProfileModal,
  closeProfileModal,
  addNotification,
  removeNotification,
  clearNotifications,
} = uiSlice.actions;

export default uiSlice.reducer;
