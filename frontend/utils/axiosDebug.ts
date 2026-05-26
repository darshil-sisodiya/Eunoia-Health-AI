import axios from 'axios';
import { API_BASE_URL } from './api';

// Register simple dev-time logging for axios requests/responses
if (__DEV__) {
  axios.interceptors.request.use((config) => {
    const url = `${config.baseURL || ''}${config.url || ''}` || '(unknown)';
    // eslint-disable-next-line no-console
    console.log('[HTTP][request]', config.method?.toUpperCase(), url, {
      baseURL: config.baseURL || API_BASE_URL,
    });
    return config;
  });

  axios.interceptors.response.use(
    (resp) => {
      const url = `${resp.config.baseURL || ''}${resp.config.url || ''}` || '(unknown)';
      // eslint-disable-next-line no-console
      console.log('[HTTP][response]', resp.status, url);
      return resp;
    },
    (error) => {
      const cfg = error.config || {};
      const url = `${cfg.baseURL || ''}${cfg.url || ''}` || '(unknown)';
      // eslint-disable-next-line no-console
      console.warn('[HTTP][error]', url, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return Promise.reject(error);
    }
  );
}
