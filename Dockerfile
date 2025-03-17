# Use the official Alpine base image
FROM alpine:latest

# Install dependencies
RUN apk update && \
    apk add --no-cache curl git unzip ffmpeg bash

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

# Command to run the application
CMD ["bun", "run", "start"]
