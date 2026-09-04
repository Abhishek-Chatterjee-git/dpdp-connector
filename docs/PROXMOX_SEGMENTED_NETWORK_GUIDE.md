# Proxmox Segmented Network Deployment Architecture

This guide details the deployment of the Enterprise Application Suite across **isolated VLAN / Subnet network zones** in Proxmox VE.

---

## 🏛️ Network Topology & Zone Isolation

```
                                [ Customer Network: 10.10.3.0/24 ]
                                (External / Customer Devices)
                                              │
                                              │ Ingress: HTTP Port 3000 Only
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🌐 DMZ NETWORK (10.10.1.0/24)                                                          │
│                                                                                        │
│   VM 101 (IP: 10.10.1.11) — Customer Storefront Container                              │
│   • Runs ONLY Customer Storefront (APP_MODE=storefront, Port 3000)                     │
│   • NO Admin tools or employee portals exposed here                                    │
│   • Connects to DB via internal firewall rule (10.10.1.11 -> 10.10.2.20:5432)         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            │ Egress: PostgreSQL TCP 5432 Only
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔒 EMPLOYEE & DATA NETWORK (10.10.2.0/24)                                              │
│ (Blocked from 10.10.3.0/24 Customer Subnet by Proxmox Firewall)                        │
│                                                                                        │
│   VM 102 (IP: 10.10.2.20) — Enterprise Database                                       │
│   • PostgreSQL Database (Port 5432)                                                    │
│   • Holds tables: users, credentials, products, orders, employees                      │
│                                                                                        │
│   VM 103 (IP: 10.10.2.15) — Operations & Staff Admin Dashboard                         │
│   • Runs ONLY Admin Portal (APP_MODE=admin, Port 3001)                                 │
│   • Accessible ONLY from employee workstations (10.10.2.x)                             │
│   • Live Inventory & Customer Orders Fulfillment                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Step-by-Step Proxmox Setup

### Step 1: Database VM (`10.10.2.20`) on Employee Network

On **VM 102 (`10.10.2.20`)**:
```bash
# Run PostgreSQL container
docker run -d --name enterprise-postgres \
  --restart unless-stopped \
  -p 5432:5432 \
  -e POSTGRES_USER=app_user \
  -e POSTGRES_PASSWORD=SecurePass2025 \
  -e POSTGRES_DB=enterprise_ecom \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

---

### Step 2: Customer Storefront VM (`10.10.1.11`) on DMZ Network

On **VM 101 (`10.10.1.11`)**:

1. Clone and build the image:
   ```bash
   git clone https://github.com/Abhishek-Chatterjee-git/dpdp-connector /opt/app
   cd /opt/app
   docker build -t enterprise-ecom -f sim-enterprise/ecom-app/Dockerfile .
   ```

2. Run **Storefront ONLY** (Port 3000):
   ```bash
   docker run -d --name ecom-storefront-dmz \
     --restart unless-stopped \
     -p 3000:3000 \
     -e APP_MODE=storefront \
     -e ECOM_PORT=3000 \
     -e DB_CONNECTION_STRING="postgres://app_user:SecurePass2025@10.10.2.20:5432/enterprise_ecom" \
     -e NODE_ENV=production \
     enterprise-ecom
   ```

---

### Step 3: Admin & Operations Portal VM (`10.10.2.15`) on Employee Network

On **VM 103 (`10.10.2.15`)**:

1. Clone and build the image:
   ```bash
   git clone https://github.com/Abhishek-Chatterjee-git/dpdp-connector /opt/app
   cd /opt/app
   docker build -t enterprise-ecom -f sim-enterprise/ecom-app/Dockerfile .
   ```

2. Run **Admin Portal ONLY** (Port 3001):
   ```bash
   docker run -d --name ecom-admin-portal \
     --restart unless-stopped \
     -p 3001:3001 \
     -e APP_MODE=admin \
     -e ADMIN_PORT=3001 \
     -e DB_CONNECTION_STRING="postgres://app_user:SecurePass2025@10.10.2.20:5432/enterprise_ecom" \
     -e NODE_ENV=production \
     enterprise-ecom
   ```

---

## 🛡️ Proxmox Firewall Rules

In Proxmox Web GUI (**Datacenter / VM Firewall**):

1. **DMZ VM (`10.10.1.11`)**:
   - **INBOUND**: Allow TCP `3000` from `10.10.3.0/24` (Customers) and any public IP.
   - **OUTBOUND**: Allow TCP `5432` to `10.10.2.20` (Database). Drop all other outbound to `10.10.2.0/24`.
2. **Database VM (`10.10.2.20`)**:
   - **INBOUND**: Allow TCP `5432` from `10.10.1.11` (DMZ Storefront) and `10.10.2.15` (Admin Portal).
   - Drop all incoming traffic from `10.10.3.0/24` (Customer subnet).
3. **Admin Portal VM (`10.10.2.15`)**:
   - **INBOUND**: Allow TCP `3001` ONLY from `10.10.2.0/24` (Employee subnet).
   - Drop all incoming traffic from `10.10.3.0/24` and `10.10.1.0/24`.
