FROM node:18

# Instala tzdata para que funcione la zona horaria
RUN apt-get update && apt-get install -y tzdata \
    && rm -rf /var/lib/apt/lists/*

# Configura la zona horaria de Colombia
ENV TZ=-05:00

# Copia el código de tu app
WORKDIR /app
COPY . .

# Instala dependencias
RUN npm install

# Comando para iniciar la app
CMD ["npm", "start"] 