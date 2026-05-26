import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from '../utils/api';

interface AuthContextType {
  token: string | null;
  username: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadToken();
  }, []);

  const loadToken = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUsername = await AsyncStorage.getItem('username');
      if (storedToken && storedUsername) {
        setToken(storedToken);
        setUsername(storedUsername);
      }
    } catch (error) {
      console.error('Error loading token:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
  const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username,
        password
      });

      const { token: newToken, username: returnedUsername } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('username', returnedUsername);
      setToken(newToken);
      setUsername(returnedUsername);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const register = async (username: string, password: string) => {
    try {
  const response = await axios.post(`${API_BASE_URL}/api/auth/register`, {
        username,
        password
      });

      const { token: newToken, username: returnedUsername } = response.data;
      await AsyncStorage.setItem('token', newToken);
      await AsyncStorage.setItem('username', returnedUsername);
      setToken(newToken);
      setUsername(returnedUsername);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('username');
    setToken(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ token, username, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
