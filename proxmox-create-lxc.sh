#!/bin/bash
set -e

# Pool Kiosk - Proxmox LXC Creator
# Run this on your Proxmox host to create a fully configured LXC container
# Usage: bash proxmox-create-lxc.sh [CTID] [IP_ADDRESS]

# Configuration
CTID=${1:-200}
IP_ADDRESS=${2:-"dhcp"}
HOSTNAME="pool-kiosk"
TEMPLATE="local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
STORAGE="local-lvm"
DISK_SIZE="16"
MEMORY="2048"
CORES="2"
REPO_URL="https://raw.githubusercontent.com/btzll1412/pool-kiosk/main/install.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if running on Proxmox
check_proxmox() {
    if ! command -v pct &> /dev/null; then
        print_error "This script must be run on a Proxmox VE host"
        exit 1
    fi
}

# Check if CTID is available
check_ctid() {
    if pct status "$CTID" &> /dev/null; then
        print_error "Container $CTID already exists"
        echo "Please choose a different CTID or remove the existing container"
        exit 1
    fi
}

# Check for template
check_template() {
    # Try to find a Debian 12 template
    AVAILABLE_TEMPLATE=$(pveam list local 2>/dev/null | grep -E "debian-12" | head -1 | awk '{print $1}')

    if [ -n "$AVAILABLE_TEMPLATE" ]; then
        TEMPLATE="local:vztmpl/$AVAILABLE_TEMPLATE"
        print_step "Found template: $TEMPLATE"
    else
        print_warning "Debian 12 template not found, downloading..."
        pveam download local debian-12-standard_12.7-1_amd64.tar.zst || {
            print_error "Failed to download template"
            echo "Please download manually: Datacenter > local > CT Templates > Templates"
            exit 1
        }
    fi
}

# Generate random password
generate_password() {
    openssl rand -base64 12 | tr -d '/+=' | head -c 16
}

# Create LXC container
create_container() {
    ROOT_PASSWORD=$(generate_password)

    print_step "Creating LXC container $CTID..."

    # Build network config
    if [ "$IP_ADDRESS" = "dhcp" ]; then
        NET_CONFIG="name=eth0,bridge=vmbr0,ip=dhcp"
    else
        # Assume /24 subnet and .1 gateway if not specified
        if [[ "$IP_ADDRESS" != *"/"* ]]; then
            IP_ADDRESS="$IP_ADDRESS/24"
        fi
        GATEWAY=$(echo "$IP_ADDRESS" | sed 's/\.[0-9]*\/.*/.1/')
        NET_CONFIG="name=eth0,bridge=vmbr0,ip=$IP_ADDRESS,gw=$GATEWAY"
    fi

    pct create "$CTID" "$TEMPLATE" \
        --hostname "$HOSTNAME" \
        --storage "$STORAGE" \
        --rootfs "$STORAGE:$DISK_SIZE" \
        --memory "$MEMORY" \
        --cores "$CORES" \
        --net0 "$NET_CONFIG" \
        --password "$ROOT_PASSWORD" \
        --unprivileged 0 \
        --features nesting=1 \
        --onboot 1

    print_step "Container created with root password: $ROOT_PASSWORD"
    echo "$ROOT_PASSWORD" > "/tmp/pool-kiosk-$CTID-password.txt"
    print_warning "Password saved to /tmp/pool-kiosk-$CTID-password.txt"
}

# Configure container for Docker
configure_container() {
    print_step "Configuring container for Docker compatibility..."

    CONFIG_FILE="/etc/pve/lxc/$CTID.conf"

    # Add Docker compatibility settings
    cat >> "$CONFIG_FILE" << 'EOF'

# Docker compatibility
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: a
lxc.cap.drop:
lxc.mount.auto: proc:rw sys:rw
EOF

    print_step "Docker compatibility configured"
}

# Start container and run installer
start_and_install() {
    print_step "Starting container..."
    pct start "$CTID"

    # Wait for container to be ready
    sleep 5

    # Wait for network
    print_step "Waiting for network..."
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if pct exec "$CTID" -- ping -c 1 -W 1 8.8.8.8 &> /dev/null; then
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_warning "Network connectivity check timed out, continuing anyway..."
    fi

    print_step "Running Pool Kiosk installer inside container..."
    pct exec "$CTID" -- bash -c "curl -fsSL $REPO_URL | bash"
}

# Get container IP
get_container_ip() {
    # Try to get IP from container
    CONTAINER_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
    echo "$CONTAINER_IP"
}

# Print completion message
print_completion() {
    CONTAINER_IP=$(get_container_ip)
    ROOT_PASSWORD=$(cat "/tmp/pool-kiosk-$CTID-password.txt" 2>/dev/null || echo "see above")

    print_header "Proxmox LXC Setup Complete!"

    echo -e "${GREEN}Pool Kiosk is running in LXC container $CTID${NC}\n"

    echo "Container Details:"
    echo -e "  ${BLUE}CTID:${NC}        $CTID"
    echo -e "  ${BLUE}Hostname:${NC}    $HOSTNAME"
    echo -e "  ${BLUE}IP Address:${NC}  $CONTAINER_IP"
    echo -e "  ${BLUE}Root Pass:${NC}   $ROOT_PASSWORD"
    echo ""
    echo "Access Pool Kiosk at:"
    echo -e "  ${BLUE}Kiosk UI:${NC}    http://$CONTAINER_IP/kiosk"
    echo -e "  ${BLUE}Admin Panel:${NC} http://$CONTAINER_IP/admin"
    echo ""
    echo -e "${YELLOW}Default Admin Login:${NC}"
    echo "  Username: admin"
    echo "  Password: changeme"
    echo ""
    echo -e "${RED}⚠ Change both passwords immediately!${NC}"
    echo ""
    echo "Container management:"
    echo "  pct enter $CTID             # Enter container shell"
    echo "  pct stop $CTID              # Stop container"
    echo "  pct start $CTID             # Start container"
    echo ""
}

# Main
main() {
    print_header "Pool Kiosk - Proxmox LXC Creator"

    echo "Configuration:"
    echo "  CTID: $CTID"
    echo "  IP: $IP_ADDRESS"
    echo "  Memory: ${MEMORY}MB"
    echo "  Disk: ${DISK_SIZE}GB"
    echo "  Cores: $CORES"
    echo ""

    check_proxmox
    check_ctid
    check_template
    create_container
    configure_container
    start_and_install
    print_completion
}

main "$@"
