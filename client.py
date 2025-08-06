import requests
import asyncio
import aiohttp
import time
import argparse

class GeminiClient:
    def __init__(self, API_BASE_URL: str = "http://127.0.0.1:8000/api"):
        self.API_BASE_URL = API_BASE_URL

    def _get(self, path):
        response = requests.get(self.API_BASE_URL + path)
        response.raise_for_status()
        return response.json()

    def _post(self, path, json):
            response = requests.post(self.API_BASE_URL + path, json=json)
            response.raise_for_status()
            return response.json()

    def send_prompt(self, prompt_text: str) -> str:
        response = self._post(f"/send_prompt", json={"text": prompt_text})
        task_id = response.get("task_id")
        if not task_id:
            raise requests.exceptions.RequestException("Error: Could not get task ID from server.", request=None, response=response)
        return task_id
    
    def get_response(self, task_id: str) -> str:
        while True:
            response = self._get(f"/get_response/{task_id}")

            status = response.get("status")
            if status == "completed":
                return response.get("response")
            elif status in ["pending", "processing"]:
                time.sleep(3)
            else:
                raise requests.exceptions.RequestException(f"An unexpected status occurred: {response}", request=None, response=response)

class GeminiAsyncClient:
    def __init__(self, API_BASE_URL: str = "http://127.0.0.1:8000/api"):
        self.API_BASE_URL = API_BASE_URL

    async def aio_get(self, path):
        async with aiohttp.ClientSession() as session:
            async with session.get(self.API_BASE_URL + path) as response:
                response.raise_for_status()
                return await response.json()

    async def aio_post(self, path, json):
        async with aiohttp.ClientSession() as session:
            async with session.post(self.API_BASE_URL + path, json=json) as response:
                response.raise_for_status()
                return await response.json()

    async def send_prompt(self, prompt_text: str) -> str:
        response = await self.aio_post(f"/send_prompt", json={"text": prompt_text})
        task_id = response.get("task_id")
        if not task_id:
            raise requests.exceptions.RequestException("Error: Could not get task ID from server.", request=None, response=None)
        return task_id
    
    async def get_response(self, task_id: str) -> str:
        while True:
            response = await self.aio_get(f"/get_response/{task_id}")

            status = response.get("status")
            if status == "completed":
                return response.get("response")
            elif status in ["pending", "processing"]:
                await asyncio.sleep(3)
            else:
                raise requests.exceptions.RequestException(f"An unexpected status occurred: {response}", request=None, response=None)

def main(prompt:str|None = None):
    prompt = prompt if prompt else """pythonで"Hello world"を表示するには"""
    client = GeminiClient()
    task_id = client.send_prompt(prompt)
    print(f"[{task_id}] {prompt}")
    response = client.get_response(task_id)
    print(f"--- [Response {task_id} Received] ---")
    print(response)
    print(f"--- [Response {task_id} End] ---\n")

async def async_main(prompt:str|None = None):
    prompt = prompt if prompt else """pythonで"Hello world"を表示するには"""
    client = GeminiAsyncClient()
    task_id = await client.send_prompt(prompt)
    print(f"[{task_id}] {prompt}")
    response = await client.get_response(task_id)
    print(f"--- [Response {task_id} Received] ---")
    print(response)
    print(f"--- [Response {task_id} End] ---\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(prog='Gemini Auto Responder Client')
    parser.add_argument('-p', '--prompt', type=str, default=None)
    args = parser.parse_args()
    main(args.prompt)
    # asyncio.run(async_main(args.prompt))
