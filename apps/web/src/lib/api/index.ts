import { config } from '../config';
import { httpApi, type TruceApi } from './client';
import { mockApi } from './mock';

export { ApiError, type TruceApi } from './client';

/** The adapter the app uses, chosen by VITE_API_MODE (mock by default). */
export const api: TruceApi = config.apiMode === 'server' ? httpApi : mockApi;
