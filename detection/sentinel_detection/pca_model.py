"""PCA reconstruction-error scoring with native handling of missing channels.

Score of a row = residual variance of the observed channels after projecting onto
the PCA subspace, *per residual degree of freedom*:

    score = sum_over_observed(residual^2) / (n_observed - k)

Dividing by the residual degrees of freedom makes scores comparable between fully
observed rows (c - k dof) and rows with some channels missing (n_observed - k dof),
whose projection is a ridge-regularised least squares fit on the observed channels
only. Rows with n_observed <= k have no residual dof and get NaN (not scorable).
"""

from __future__ import annotations

import numpy as np

MIN_STD = 1e-9


class PCAModel:
    def __init__(self, var_target: float = 0.95, max_components: int | None = None, ridge: float = 1e-6):
        if not 0 < var_target <= 1:
            raise ValueError("var_target must be in (0, 1]")
        self.var_target = var_target
        self.max_components = max_components
        self.ridge = ridge

    def fit(self, X: np.ndarray) -> "PCAModel":
        X = np.asarray(X, dtype=float)
        if X.ndim != 2 or X.shape[1] < 2:
            raise ValueError("PCA needs a 2-D matrix with at least 2 channels")
        if not np.isfinite(X).all():
            raise ValueError("training matrix must be fully observed and finite")
        n, c = X.shape
        if n < 2 * c:
            raise ValueError(f"need at least {2 * c} training rows for {c} channels, got {n}")
        self.mean_ = X.mean(axis=0)
        self.std_ = X.std(axis=0, ddof=1)
        if np.any(self.std_ <= MIN_STD):
            raise ValueError("constant channel in training data; drop it first")
        Z = (X - self.mean_) / self.std_
        w, V = np.linalg.eigh(Z.T @ Z / (n - 1))
        order = np.argsort(w)[::-1]
        w = np.clip(w[order], 0, None)
        V = V[:, order]
        ratio = w / w.sum()
        k = int(np.searchsorted(np.cumsum(ratio), self.var_target) + 1)
        k_max = c - 1 if self.max_components is None else min(c - 1, self.max_components)
        k = max(1, min(k, k_max))
        self.components_ = V[:, :k]
        self.explained_variance_ratio_ = ratio[:k]
        self.n_train_ = n
        return self

    @property
    def n_components(self) -> int:
        return self.components_.shape[1]

    def score(self, X: np.ndarray, chunk: int = 20000) -> np.ndarray:
        X = np.asarray(X, dtype=float)
        Z = (X - self.mean_) / self.std_
        P = self.components_
        k = P.shape[1]
        eye = self.ridge * np.eye(k)
        out = np.full(len(Z), np.nan)
        for a in range(0, len(Z), chunk):
            z = Z[a : a + chunk]
            m = np.isfinite(z)
            mf = m.astype(float)
            z0 = np.where(m, z, 0.0)
            A = np.einsum("ck,tc,cl->tkl", P, mf, P, optimize=True) + eye
            t = np.linalg.solve(A, (z0 @ P)[..., None])[..., 0]
            r = (z0 - t @ P.T) * mf
            sse = (r**2).sum(axis=1)
            dof = mf.sum(axis=1) - k
            ok = dof > 0
            seg = out[a : a + chunk]
            seg[ok] = sse[ok] / dof[ok]
        return out

    def summary(self) -> dict:
        return {
            "algorithm": "PCA reconstruction error (residual variance per dof)",
            "n_components": self.n_components,
            "var_target": self.var_target,
            "explained_variance_ratio": [round(float(v), 5) for v in self.explained_variance_ratio_],
            "explained_variance_total": round(float(self.explained_variance_ratio_.sum()), 5),
            "n_train_rows": int(self.n_train_),
        }
