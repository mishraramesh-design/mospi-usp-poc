/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_SUPERSET_URL: process.env.NEXT_PUBLIC_SUPERSET_URL || "http://localhost:8088",
    NEXT_PUBLIC_AIRFLOW_URL: process.env.NEXT_PUBLIC_AIRFLOW_URL || "http://localhost:8080",
    NEXT_PUBLIC_ODK_URL: process.env.NEXT_PUBLIC_ODK_URL || "http://localhost:8383",
  },
};

module.exports = nextConfig;
