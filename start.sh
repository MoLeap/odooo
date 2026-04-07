#!/bin/bash
# Start Odoo 16 locally (non-Docker)
set -e

# Start PostgreSQL if not running
if ! pg_isready -q; then
    echo "Starting PostgreSQL..."
    pg_ctlcluster 16 main start
fi

# Start Odoo
echo "Starting Odoo on http://localhost:8069 ..."
exec /usr/bin/odoo -c "$(dirname "$0")/config/odoo-local.conf" -d odoo "$@"
