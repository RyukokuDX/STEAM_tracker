const path = require('path');

// 先に GAS API モックを注入してからコードを読み込む
require('./__mocks__/google-apps-script');

// 安定運用のため、明示的に対象ファイルのみ読み込む（以前の動作に戻す）
require(path.resolve(__dirname, '../コード.js'));


