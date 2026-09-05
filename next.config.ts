import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/vendas/processar": ["./prompts/**/*"],
    "/api/financeiro/conciliar": ["./prompts/**/*"],
  },
};

export default nextConfig;
