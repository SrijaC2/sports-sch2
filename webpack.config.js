const path = require("path");
const nodeExternals = require("webpack-node-externals");

module.exports = {
  entry: "./index.js",
  output: {
    filename: "bundle.js",
    // eslint-disable-next-line no-undef
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: ["file-loader"],
      },
    ],
  },
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
  target: "node",
  externals: [nodeExternals()],
};
