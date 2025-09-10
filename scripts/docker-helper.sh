#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Main menu
show_menu() {
    echo ""
    echo -e "${BLUE}🐳 Docker Helper for WordsTo.Link${NC}"
    echo ""
    echo "1) Start all services"
    echo "2) Stop all services"
    echo "3) Restart all services"
    echo "4) View logs"
    echo "5) Clean up (remove containers and volumes)"
    echo "6) Database shell"
    echo "7) Redis CLI"
    echo "8) Check service status"
    echo "9) Backup database"
    echo "10) Restore database"
    echo "0) Exit"
    echo ""
}

# Start services
start_services() {
    print_status "Starting Docker services..."
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        print_success "Services started successfully!"
        echo ""
        docker-compose ps
    else
        print_error "Failed to start services"
    fi
}

# Stop services
stop_services() {
    print_status "Stopping Docker services..."
    docker-compose down
    
    if [ $? -eq 0 ]; then
        print_success "Services stopped successfully!"
    else
        print_error "Failed to stop services"
    fi
}

# Restart services
restart_services() {
    print_status "Restarting Docker services..."
    docker-compose restart
    
    if [ $? -eq 0 ]; then
        print_success "Services restarted successfully!"
        echo ""
        docker-compose ps
    else
        print_error "Failed to restart services"
    fi
}

# View logs
view_logs() {
    echo "Select service:"
    echo "1) All services"
    echo "2) PostgreSQL"
    echo "3) Redis"
    echo "4) Adminer"
    read -p "Choice: " log_choice
    
    case $log_choice in
        1) docker-compose logs -f --tail=100 ;;
        2) docker-compose logs -f --tail=100 postgres ;;
        3) docker-compose logs -f --tail=100 redis ;;
        4) docker-compose logs -f --tail=100 adminer ;;
        *) print_error "Invalid choice" ;;
    esac
}

# Clean up
cleanup() {
    print_warning "This will remove all containers, volumes, and data!"
    read -p "Are you sure? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_status "Cleaning up Docker resources..."
        docker-compose down -v
        
        if [ $? -eq 0 ]; then
            print_success "Cleanup completed!"
        else
            print_error "Cleanup failed"
        fi
    else
        print_status "Cleanup cancelled"
    fi
}

# Database shell
db_shell() {
    print_status "Connecting to PostgreSQL..."
    docker-compose exec postgres psql -U wordsto -d wordsto_link
}

# Redis CLI
redis_cli() {
    print_status "Connecting to Redis..."
    docker-compose exec redis redis-cli
}

# Check status
check_status() {
    print_status "Service Status:"
    echo ""
    docker-compose ps
    echo ""
    
    print_status "Database Status:"
    docker-compose exec -T postgres pg_isready -U wordsto -d wordsto_link && \
        print_success "PostgreSQL is ready" || \
        print_error "PostgreSQL is not ready"
    
    print_status "Redis Status:"
    docker-compose exec -T redis redis-cli ping > /dev/null 2>&1 && \
        print_success "Redis is ready" || \
        print_error "Redis is not ready"
}

# Backup database
backup_db() {
    BACKUP_DIR="./backups"
    mkdir -p $BACKUP_DIR
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/wordsto_backup_$TIMESTAMP.sql"
    
    print_status "Creating database backup..."
    docker-compose exec -T postgres pg_dump -U wordsto wordsto_link > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        print_success "Backup created: $BACKUP_FILE"
        echo "Size: $(du -h $BACKUP_FILE | cut -f1)"
    else
        print_error "Backup failed"
    fi
}

# Restore database
restore_db() {
    BACKUP_DIR="./backups"
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR)" ]; then
        print_error "No backups found in $BACKUP_DIR"
        return
    fi
    
    echo "Available backups:"
    ls -1 $BACKUP_DIR/*.sql 2>/dev/null | nl
    
    read -p "Enter backup number to restore (0 to cancel): " backup_num
    
    if [ "$backup_num" = "0" ]; then
        print_status "Restore cancelled"
        return
    fi
    
    BACKUP_FILE=$(ls -1 $BACKUP_DIR/*.sql 2>/dev/null | sed -n "${backup_num}p")
    
    if [ -z "$BACKUP_FILE" ]; then
        print_error "Invalid selection"
        return
    fi
    
    print_warning "This will overwrite the current database!"
    read -p "Are you sure? (y/N): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        print_status "Restoring database from $BACKUP_FILE..."
        docker-compose exec -T postgres psql -U wordsto wordsto_link < $BACKUP_FILE
        
        if [ $? -eq 0 ]; then
            print_success "Database restored successfully!"
        else
            print_error "Restore failed"
        fi
    else
        print_status "Restore cancelled"
    fi
}

# Main loop
while true; do
    show_menu
    read -p "Enter choice: " choice
    
    case $choice in
        1) start_services ;;
        2) stop_services ;;
        3) restart_services ;;
        4) view_logs ;;
        5) cleanup ;;
        6) db_shell ;;
        7) redis_cli ;;
        8) check_status ;;
        9) backup_db ;;
        10) restore_db ;;
        0) print_status "Goodbye!"; exit 0 ;;
        *) print_error "Invalid option" ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
done