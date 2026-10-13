FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY sentinel_detection ./sentinel_detection
EXPOSE 8000
CMD ["uvicorn", "sentinel_detection.service:app", "--host", "0.0.0.0", "--port", "8000"]
