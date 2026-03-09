#!/bin/bash
set -e

# Pool Kiosk - One-Click Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/btzll1412/pool-kiosk/main/install.sh | bash

REPO_URL="https://github.com/btzll1412/pool-kiosk.git"
INSTALL_DIR="/opt/pool-kiosk"
BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Detect environment
detect_environment() {
    if [ -f /run/systemd/container ]; then
        CONTAINER_TYPE=$(cat /run/systemd/container 2>/dev/null || echo "none")
    else
        CONTAINER_TYPE="none"
    fi

    if [ "$CONTAINER_TYPE" = "lxc" ]; then
        echo "lxc"
    elif [ -f /.dockerenv ]; then
        echo "docker"
    else
        echo "bare"
    fi
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        echo "Please run: sudo bash install.sh"
        exit 1
    fi
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_step "Docker already installed: $(docker --version)"
        return 0
    fi

    print_step "Installing Docker..."
    curl -fsSL https://get.docker.com | sh

    # Start Docker service
    systemctl enable docker 2>/dev/null || true
    systemctl start docker 2>/dev/null || true

    print_step "Docker installed: $(docker --version)"
}

# Install Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 18 ]; then
            print_step "Node.js already installed: $NODE_VERSION"
            return 0
        else
            print_warning "Node.js $NODE_VERSION is too old, upgrading to 18+"
        fi
    fi

    print_step "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs

    print_step "Node.js installed: $(node --version)"
}

# Install dependencies
install_dependencies() {
    print_step "Installing system dependencies..."
    apt-get update -qq
    apt-get install -y curl git openssl ca-certificates gnupg
}

# Clone or update repository
setup_repository() {
    if [ -d "$INSTALL_DIR/.git" ]; then
        print_step "Repository exists, pulling latest changes..."
        cd "$INSTALL_DIR"
        git fetch origin
        git reset --hard "origin/$BRANCH"
    else
        print_step "Cloning repository..."
        mkdir -p "$(dirname "$INSTALL_DIR")"
        git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    print_step "Repository ready at $INSTALL_DIR"
}

# Build frontend
build_frontend() {
    print_step "Building frontend..."
    cd "$INSTALL_DIR/frontend"

    # Clean install
    rm -rf node_modules package-lock.json 2>/dev/null || true
    npm install --legacy-peer-deps
    npm run build

    if [ -d "$INSTALL_DIR/frontend/dist" ]; then
        print_step "Frontend built successfully"
    else
        print_error "Frontend build failed - dist folder not created"
        exit 1
    fi
}

# Configure environment
configure_environment() {
    cd "$INSTALL_DIR"

    if [ -f .env ]; then
        print_warning ".env file exists, backing up to .env.backup"
        cp .env .env.backup
    fi

    cp .env.example .env

    # Generate secure credentials
    DB_PASSWORD=$(openssl rand -hex 16)
    SECRET_KEY=$(openssl rand -hex 32)

    # Update .env file
    sed -i "s/change-me-strong-password/$DB_PASSWORD/g" .env
    sed -i "s/change-me-in-production/$SECRET_KEY/g" .env

    print_step "Environment configured with secure credentials"
}

# Adjust Docker Compose for non-LXC environments
adjust_docker_compose() {
    ENV_TYPE=$1
    cd "$INSTALL_DIR"

    if [ "$ENV_TYPE" != "lxc" ]; then
        # Remove privileged: true for non-LXC environments
        if grep -q "privileged: true" docker-compose.yml; then
            print_step "Adjusting Docker Compose for non-LXC environment..."
            sed -i 's/privileged: true/# privileged: true  # Not needed outside LXC/g' docker-compose.yml
        fi
    fi
}

# Start services
start_services() {
    cd "$INSTALL_DIR"

    print_step "Starting services with Docker Compose..."
    docker compose down 2>/dev/null || true
    docker compose up -d --build

    print_step "Waiting for services to start..."
    sleep 10

    # Check if backend is healthy
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            print_step "Backend is healthy"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_warning "Backend health check timed out, but services may still be starting"
    fi
}

# Get IP address
get_ip_address() {
    # Try to get the primary IP
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -z "$IP" ]; then
        IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1)
    fi
    if [ -z "$IP" ]; then
        IP="<your-server-ip>"
    fi
    echo "$IP"
}

# Print completion message
print_completion() {
    IP=$(get_ip_address)

    print_header "Installation Complete!"

    echo -e "${GREEN}Pool Kiosk is now running!${NC}\n"
    echo "Access your system at:"
    echo -e "  ${BLUE}Kiosk UI:${NC}    http://$IP/kiosk"
    echo -e "  ${BLUE}Admin Panel:${NC} http://$IP/admin"
    echo -e "  ${BLUE}API Docs:${NC}    http://$IP/docs"
    echo ""
    echo -e "${YELLOW}Default Admin Login:${NC}"
    echo "  Username: admin"
    echo "  Password: changeme"
    echo ""
    echo -e "${RED}⚠ Change the admin password immediately after first login!${NC}"
    echo ""
    echo "Useful commands:"
    echo "  cd $INSTALL_DIR"
    echo "  docker compose logs -f      # View logs"
    echo "  docker compose restart      # Restart services"
    echo "  docker compose down         # Stop services"
    echo ""
}

# Main installation flow
main() {
    print_header "Pool Kiosk Installer"

    check_root

    ENV_TYPE=$(detect_environment)
    print_step "Detected environment: $ENV_TYPE"

    if [ "$ENV_TYPE" = "lxc" ]; then
        print_warning "Running in LXC container - ensure nesting is enabled"
    fi

    install_dependencies
    install_docker
    install_nodejs
    setup_repository
    build_frontend
    configure_environment
    adjust_docker_compose "$ENV_TYPE"
    start_services
    print_completion
}

# Run main function
main "$@"
