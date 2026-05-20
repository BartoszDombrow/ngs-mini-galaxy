FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bwa \
    bcftools \
    default-jre-headless \
    fastqc \
    samtools \
    sra-toolkit \
    trimmomatic \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install multiqc

COPY app ./app
COPY seeds ./seeds

RUN mkdir -p /data/storage/uploads /data/storage/jobs /data/storage/results

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
