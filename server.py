import uuid
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import logging
from threading import Lock

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI()

origins = ["https://gemini.google.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    """ユーザーからのプロンプト送信リクエスト"""
    text: str

class ResponseRequest(BaseModel):
    """Tampermonkeyからの応答送信リクエスト"""
    task_id: str
    response: str

class Task(BaseModel):
    """キューで管理されるタスク"""
    prompt: str
    response: Optional[str] = None
    status: str

tasks_lock = Lock()
tasks: Dict[str, Task] = {}

@app.get("/")
def read_root():
    return {"message": "Gemini Automation Server is running."}

@app.post("/api/send_prompt", status_code=202)
def send_prompt(prompt: PromptRequest):
    """
    プロンプトを送信し、タスクIDを受け取る
    """
    with tasks_lock:
        task_id = str(uuid.uuid4())
        new_task = Task(prompt=prompt.text, status="pending")
        tasks[task_id] = new_task
        logger.info(f"New task created with ID: {task_id}")
        return {"task_id": task_id}

@app.get("/api/get_prompt")
def get_prompt():
    """
    Tampermonkeyが処理すべきタスクを取得する
    """
    with tasks_lock:
        for task_id, task in tasks.items():
            if task.status == "pending":
                task.status = "processing"
                logger.info(f"Task {task_id} picked up by Tampermonkey.")
                return {"prompt": task.prompt, "task_id": task_id}
        return {"prompt": None, "task_id": None}

@app.post("/api/receive_response")
def receive_response(response_data: ResponseRequest):
    """
    Tampermonkeyが処理結果をID付きで送信する
    """
    with tasks_lock:
        task_id = response_data.task_id
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task ID {task_id} not found.")
        if task.status != "processing":
            logger.warning(f"Received response for task {task_id} which is not in 'processing' state.")
            raise HTTPException(status_code=409, detail=f"Task is not in 'processing' state.")

        task.response = response_data.response
        task.status = "completed"
        logger.info(f"Task {task_id} completed.")
        return {"status": "success", "message": f"Task {task_id} has been completed."}

@app.get("/api/get_response/{task_id}")
def get_response(task_id: str):
    """
    IDを指定してタスクの進捗と結果を取得する
    """
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task ID {task_id} not found.")
        
        return {"status": task.status, "response": task.response}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
