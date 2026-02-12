# AionUI Development Justfile
# Usage: vx just <recipe>

# Default recipe: show available commands
default:
    @just --list

# ============================================================
# Development
# ============================================================

# Start development server
dev:
    vx npm run start

# Start WebUI development mode
webui:
    vx npm run webui

# Start WebUI with remote access
webui-remote:
    vx npm run webui:remote

# Start WebUI production mode
webui-prod:
    vx npm run webui:prod

# Run CLI mode
cli:
    vx npm run cli

# ============================================================
# Build
# ============================================================

# Build for current platform
build:
    vx npm run build

# Build for Windows
build-win:
    vx npm run build-win

# Build for macOS (arm64 + x64)
build-mac:
    vx npm run build-mac

# Build for macOS ARM64 only
build-mac-arm64:
    vx npm run build-mac:arm64

# Build for macOS x64 only
build-mac-x64:
    vx npm run build-mac:x64

# Build for Linux (deb)
build-linux:
    vx npm run build-deb

# Package without installer
package:
    vx npm run package

# Distribute
dist:
    vx npm run dist

# ============================================================
# Code Quality
# ============================================================

# Run linter
lint:
    vx npm run lint

# Run linter with auto-fix
lint-fix:
    vx npm run lint:fix

# Format code
fmt:
    vx npm run format

# Check formatting
fmt-check:
    vx npm run format:check

# Type check
typecheck:
    vx npx tsc --noEmit

# Run all checks (lint + format check + typecheck)
check: lint fmt-check typecheck

# ============================================================
# Testing
# ============================================================

# Run all tests
test:
    vx npm run test

# Run tests in watch mode
test-watch:
    vx npm run test:watch

# Run tests with coverage
test-coverage:
    vx npm run test:coverage

# Run contract tests
test-contract:
    vx npm run test:contract

# Run integration tests
test-integration:
    vx npm run test:integration

# ============================================================
# Dependencies
# ============================================================

# Install dependencies
install:
    vx npm install

# Install dependencies and run postinstall
setup: install
    vx npm run postinstall

# ============================================================
# Extension System (RFC-001)
# ============================================================

# Validate extension system types compile correctly
ext-typecheck:
    vx npx tsc --noEmit --project tsconfig.json

# Run extension system tests
ext-test:
    vx npx jest src/extensions/ --passWithNoTests

# Run extension system tests in watch mode
ext-test-watch:
    vx npx jest src/extensions/ --watch --passWithNoTests

# ============================================================
# Utilities
# ============================================================

# Reset WebUI password
reset-password:
    vx npm run resetpass

# Clean build artifacts
clean:
    @if (Test-Path .webpack) { Remove-Item -Recurse -Force .webpack }
    @if (Test-Path out) { Remove-Item -Recurse -Force out }
    @if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    @echo "Cleaned build artifacts"

# Show project info
info:
    @echo "AionUI Extension System Development"
    @echo "===================================="
    @echo "Branch: feature/extension-system"
    @echo ""
    @vx node --version
    @vx npm --version
