import axios from "axios";
import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = Cookies.get("token") || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      Cookies.remove("token");
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", new URLSearchParams({ username: email, password })),
  me: () => api.get("/auth/me"),
  users: () => api.get("/auth/users"),
  createUser: (data: any) => api.post("/auth/users", data),
  updateUser: (id: string, data: any) => api.patch(`/auth/users/${id}`, data),
};

export const surveyApi = {
  list: () => api.get("/surveys"),
  get: (id: string) => api.get(`/surveys/${id}`),
  create: (data: any) => api.post("/surveys", data),
  updateStatus: (id: string, status: string) => api.patch(`/surveys/${id}/status?status=${status}`),
  stats: (id: string) => api.get(`/surveys/${id}/stats`),
};

export const pipelineApi = {
  overview: () => api.get("/pipeline/overview"),
  bronze: (params?: any) => api.get("/pipeline/bronze", { params }),
  bronzeDetail: (id: string) => api.get(`/pipeline/bronze/${id}`),
  silver: (params?: any) => api.get("/pipeline/silver", { params }),
  trend: () => api.get("/pipeline/trend"),
  triggerBronzeToSilver: (surveyId?: string) => api.post(`/pipeline/trigger-bronze-to-silver${surveyId ? `?survey_id=${surveyId}` : ""}`),
  triggerSilverToGold: (surveyId?: string) => api.post(`/pipeline/trigger-silver-to-gold${surveyId ? `?survey_id=${surveyId}` : ""}`),
};

export const dqApi = {
  runs: (surveyId?: string) => api.get("/dq/runs", { params: surveyId ? { survey_id: surveyId } : {} }),
  runDetail: (runId: string) => api.get(`/dq/runs/${runId}`),
  scorecard: (surveyId?: string) => api.get("/dq/scorecard", { params: surveyId ? { survey_id: surveyId } : {} }),
  rules: (surveyId?: string) => api.get("/dq/rules", { params: surveyId ? { survey_id: surveyId } : {} }),
  runDq: (surveyId: string) => api.post(`/dq/run?survey_id=${surveyId}`),
};

export const statsApi = {
  plans: (surveyId?: string) => api.get("/stats/plans", { params: surveyId ? { survey_id: surveyId } : {} }),
  createPlan: (data: any) => api.post("/stats/plans", data),
  tabulate: (data: any) => api.post("/stats/tabulate", data),
  results: (planId?: string) => api.get("/stats/results", { params: planId ? { plan_id: planId } : {} }),
};

export const lineageApi = {
  record: (bronzeId: string) => api.get(`/lineage/record/${bronzeId}`),
  feed: (params?: any) => api.get("/lineage/feed", { params }),
  stats: () => api.get("/lineage/stats"),
};

export const samplingApi = {
  frames: (surveyId?: string) => api.get("/sampling/frames", { params: surveyId ? { survey_id: surveyId } : {} }),
  uploadFrame: (surveyId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/sampling/frames/${surveyId}/upload`, fd);
  },
  allocate: (frameId: string, n: number) => api.post(`/sampling/frames/${frameId}/allocate?n=${n}`),
  units: (frameId: string, selected?: boolean) => api.get(`/sampling/frames/${frameId}/units`, { params: { selected_only: selected } }),
  states: () => api.get("/sampling/states"),
};

export default api;
