"""Tests for authentication endpoints."""

import pytest


class TestLogin:
    def test_login_success(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "testpass",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "wrong",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "anything",
        })
        assert resp.status_code == 401


class TestTokenRefresh:
    def test_refresh_success(self, client, admin_user):
        login = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "testpass",
        })
        refresh_token = login.json()["refresh_token"]

        resp = client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_invalid_token(self, client):
        resp = client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here",
        })
        assert resp.status_code == 401


class TestProtectedRoutes:
    def test_members_requires_auth(self, client):
        resp = client.get("/api/members")
        assert resp.status_code in (401, 403)

    def test_members_with_auth(self, client, admin_headers):
        resp = client.get("/api/members", headers=admin_headers)
        assert resp.status_code == 200

    def test_plans_requires_auth(self, client):
        resp = client.post("/api/plans", json={
            "name": "Test",
            "plan_type": "single",
            "price": "5.00",
        })
        assert resp.status_code in (401, 403)
