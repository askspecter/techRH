/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi's connectors barrel eagerly imports the Coinbase / base-org
    // account SDKs (for the Coinbase/base connectors we don't use). Those
    // drag in optional x402 payment packages that aren't installed. We only
    // use the `injected` connector, so stub the whole unused subtree.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@coinbase/cdp-sdk": false,
      "@base-org/account": false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional RN storage dep referenced by MetaMask SDK; unused on web.
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    return config;
  },
};

module.exports = nextConfig;
