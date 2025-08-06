# Gemini Auto Responder

このプロジェクトは、バックエンドサーバーとブラウザのユーザースクリプトを連携させ、外部からGeminiの操作を自動化するためのシステムです。

## 使用方法

#### ステップ1: サーバーのセットアップと起動

1.  **リポジトリをクローン:**
    ```bash
    git clone https://github.com/h4ribote/gemini-auto-responder.git
    cd gemini-auto-responder
    ```

2.  **必要なPythonライブラリをインストール:**
    ```bash
    pip install fastapi "uvicorn[standard]"
    ```

3.  **サーバーを起動:**
    ターミナルで以下のコマンドを実行します。サーバーが `http://127.0.0.1:8000` で起動します。
    ```bash
    python server.py
    ```

#### ステップ2: ユーザースクリプトのインストール

1.  ブラウザに **Tampermonkey** 拡張機能がインストールされていることを確認します。([Tampermonkey](https://www.tampermonkey.net/))
2.  [script.user.js](https://github.com/h4ribote/gemini-auto-responder/raw/refs/heads/main/script.user.js)を開いてスクリプトをインストールします。

#### ステップ3: クライアントの実行

1.  **Geminiを開く:**
    ブラウザで [Gemini](https://gemini.google.com/app) を開いておきます。`script.user.js` がこのページで自動的に動作を開始します。

2.  **クライアントからプロンプトを送信:**
    新しいターミナルを開き、以下のコマンドを実行します。
    
    * **サンプルプロンプトを実行する場合:**
        ```bash
        python3 client.py
        ```

    * **独自のプロンプトを指定する場合:**
        ```bash
        python3 client.py -p オーストラリアの首都はどこですか？
        ```
    
    クライアントはプロンプトをサーバーに送信し、処理が完了するまで待機して結果を表示します。

---

## 動作の仕組み

このシステムは、3つのコンポーネントが連携して動作します。

1.  **FastAPI Server (`server.py`)**: ユーザーからのプロンプトをキューとして受け付け、処理待ちのタスクを管理します。
2.  **Tampermonkey Script (`script.user.js`)**: Geminiのウェブページ上で動作し、サーバーに新しいタスクがないか定期的に確認します。タスクがあれば、Geminiにプロンプトを自動で入力・送信し、応答が完了したらその内容をMarkdown形式で取得してサーバーに送り返します。
3.  **User Client (`client.py`)**: エンドユーザーがプロンプトをサーバーに送信したり、処理が完了したタスクの結果を取得したりするためのコマンドラインツールです。
