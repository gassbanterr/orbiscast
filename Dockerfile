# Use the official Alpine base image
FROM alpine:latest

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apk update && \
    apk add --no-cache curl git unzip ffmpeg build-base bash

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV PATH="/root/.bun/bin:$PATH"

# Set the working directory
WORKDIR /app

# Copy the project files into the container
COPY . .

# Install project dependencies
RUN bun install

# Set COMPOSE_BAKE environment variable
ENV COMPOSE_BAKE=true

# Command to run the application
CMD ["bun", "run", "start"]
