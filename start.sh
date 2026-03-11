#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# -- Colors --
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${RED}${BOLD}UvA API Gateway${NC}"
    echo -e "${CYAN}Self-hosted API endpoint manager${NC}"
    echo "--------------------------------------"
    echo ""
}

# -- Check system dependencies --
check_dependencies() {
    local missing=()

    if ! command -v node &>/dev/null; then
        missing+=("node")
    else
        local node_ver
        node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$node_ver" -lt 18 ]; then
            echo -e "${RED}Node.js >= 18 is required (found v$(node -v))${NC}"
            echo "Install via: https://nodejs.org/ or 'nvm install 18'"
            exit 1
        fi
    fi

    if ! command -v npm &>/dev/null; then
        missing+=("npm")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}Missing required dependencies: ${missing[*]}${NC}"
        echo ""
        echo "Install Node.js (>= 18):"
        echo "  - Fedora/RHEL: sudo dnf install nodejs"
        echo "  - Ubuntu/Debian: sudo apt install nodejs npm"
        echo "  - Or via nvm: https://github.com/nvm-sh/nvm"
        exit 1
    fi

    echo -e "${GREEN}Node.js $(node -v) detected${NC}"

    # Optional: check for sqlite3 CLI (used by cookie extraction)
    if ! command -v sqlite3 &>/dev/null; then
        echo -e "${YELLOW}sqlite3 CLI not found (optional, used for browser cookie extraction)${NC}"
        echo "  Install: sudo dnf install sqlite  OR  sudo apt install sqlite3"
    fi

    # Optional: check for cloudflared
    if ! command -v cloudflared &>/dev/null; then
        echo -e "${YELLOW}cloudflared not found (optional, needed for tunnel feature)${NC}"
        echo "  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    fi
}

# -- Install npm packages --
install_packages() {
    if [ ! -d "node_modules" ]; then
        echo ""
        echo -e "${CYAN}Installing npm dependencies...${NC}"
        npm install
    else
        echo -e "${GREEN}npm packages already installed${NC}"
    fi
}

# -- Setup .env file --
setup_env() {
    if [ -f "$ENV_FILE" ]; then
        echo -e "${GREEN}.env file exists${NC}"
        return
    fi

    echo ""
    echo -e "${CYAN}Setting up .env configuration...${NC}"
    echo ""

    # Port
    read -rp "Server port [3000]: " port
    port="${port:-3000}"

    # JWT secret
    jwt_secret=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')

    # Cloudflared config
    echo ""
    echo "Cloudflare Tunnel config file (optional, leave empty for quick tunnels):"
    read -rp "CLOUDFLARED_CONFIG []: " cf_config

    cat > "$ENV_FILE" <<EOF
# Server
PORT=$port

# JWT secret (auto-generated)
JWT_SECRET=$jwt_secret

# Cloudflare Tunnel (optional)
# For named tunnels, point to your cloudflared config file
CLOUDFLARED_CONFIG=$cf_config
EOF

    echo ""
    echo -e "${GREEN}.env file created${NC}"
}

# -- Main --
print_header
check_dependencies
install_packages
setup_env

echo ""
echo "--------------------------------------"
echo -e "${GREEN}${BOLD}Starting API Gateway...${NC}"
echo ""

exec node server.js
