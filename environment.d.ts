declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_TLS_REJECT_UNAUTHORIZED: string;
    }
  }
}

export {};
