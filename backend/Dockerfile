FROM python:3.10-slim

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY . .

# Donner les droits d'écriture pour la base SQLite locale
RUN chmod -R 777 /code

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]