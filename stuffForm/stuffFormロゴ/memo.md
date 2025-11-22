# 画像メモ

フォームで使用する画像の扱い方についてのメモです。

## 手順
1. Google Drive に画像ファイルをアップロードする。
2. 共有設定を「リンクを知っている全員が閲覧可」または必要に応じたドメイン共有状態に変更する。
3. 共有リンクを取得し、`https://drive.google.com/file/d/FILE_ID/view?...` を控える。
4. index.html内で画像を埋め込む際に以下のように記述してください。
  ex. https://lh3.googleusercontent.com/d/FILE_ID=w128

## 埋め込み例
```
h1::before {
      left: calc(50% - 8px - 64px);
      background-image: url(
        "https://lh3.googleusercontent.com/d/FILE_ID=w128"
      );
    }
```

`FILE_ID` を実際の画像ファイルIDに置き換えてください。
`=w128`は解像度です。適宜変えてください。

## 注意
- プレビューされない場合は共有設定（閲覧権限）が正しいか再確認する。
- h1::beforeとh1::afterだけを変えれば良いと思います。
