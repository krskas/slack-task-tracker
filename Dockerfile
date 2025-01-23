FROM node:20-slim

WORKDIR /app

# Install dependencies and TypeScript
COPY package*.json ./
RUN npm install

# Copy source files and compile TypeScript
COPY . .
RUN npm run build

# Verify build
RUN test -d dist && \
    test -f dist/index.js && \
    echo "Build verified successfully"

CMD ["npm", "start"] 