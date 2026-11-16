const backend = 'http://127.0.0.1:' + (process.env.FINN_API_PORT || '4174');

export default {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: backend + '/api/:path*' },
      { source: '/healthz', destination: backend + '/healthz' },
      { source: '/logos/:symbol', destination: backend + '/logos/:symbol' }
    ];
  }
};
