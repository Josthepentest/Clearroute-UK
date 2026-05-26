/app/.venv/bin/pip install -r requirements.txt
/app/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port $PORT