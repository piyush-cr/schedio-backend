# Schedio Kubernetes Deployment

## Prerequisites

- `kubectl` configured for your cluster
- MongoDB (replica set) and Redis—use managed services (Atlas, Redis Cloud) or run in-cluster
- Container registry with the built image (e.g., GHCR, Docker Hub)

## Quick Start

### 1. Create the secret

Create `secret.yaml` from the example (do not commit real credentials):

```bash
cp k8s/secret.yaml.example k8s/secret.yaml
# Edit k8s/secret.yaml with real values
kubectl apply -f k8s/secret.yaml
```

Or create from an env file:

```bash
kubectl create secret generic schedio-secrets --from-env-file=.env.prod -n schedio
```

Required env vars: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. For Redis: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `REDIS_URL` for BullMQ TCP override).

### 2. Apply manifests

Replace `REPLACE_ORG` in `api-deployment.yaml` and `worker-deployment.yaml` with your GitHub org/username (for `ghcr.io/ORG/schedio-backend`), then:

```bash
kubectl apply -f k8s/
```

Or with kustomize:

```bash
kubectl apply -k k8s/
```

### 3. Build and push image

Build and push your image to the registry:

```bash
docker build -t ghcr.io/YOUR_ORG/schedio-backend:latest .
docker push ghcr.io/YOUR_ORG/schedio-backend:latest
```

## CI/CD (GitHub Actions)

The `.github/workflows/ci-cd.yml` workflow:

1. **Lint & test** on every push/PR
2. **Build & push** Docker image to GHCR on push to `main`
3. **Deploy** to Kubernetes (optional)

To enable auto-deploy:

1. Add `KUBE_CONFIG` secret: base64-encoded kubeconfig
   ```bash
   cat ~/.kube/config | base64 -w0
   ```
2. Add as repository secret: `KUBE_CONFIG`
3. Create `schedio` namespace and apply manifests once (or add an apply step to the workflow)

To use Docker Hub instead of GHCR, change `REGISTRY` and add `DOCKER_USERNAME` / `DOCKER_PASSWORD` secrets.
