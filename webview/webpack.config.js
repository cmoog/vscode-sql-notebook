//webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  devtool: 'inline-source-map',
  entry: {
    main: path.resolve(__dirname, './main.tsx'),
  },
  output: {
    path: path.resolve(__dirname, '../out/webview'),
    filename: '[name]-bundle.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
      },
    ],
  },
};
