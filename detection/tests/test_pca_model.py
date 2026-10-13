import numpy as np
import pytest

from sentinel_detection.pca_model import PCAModel


def latent(n=3000, c=6, seed=0, noise=0.2):
    rng = np.random.default_rng(seed)
    F = rng.normal(size=(n, 2))
    return F @ rng.normal(size=(2, c)) + noise * rng.normal(size=(n, c))


def test_correlation_breaking_rows_score_higher():
    X = latent()
    m = PCAModel().fit(X[:2000])
    normal = m.score(X[2000:])
    broken = X[2000:].copy()
    broken[:, 0] = np.random.default_rng(1).permutation(broken[:, 0])  # same marginal, broken correlation
    assert np.median(m.score(broken)) > 3 * np.median(normal)


def test_components_bounded_and_explain_target():
    X = latent()
    m = PCAModel(var_target=0.9).fit(X)
    assert 1 <= m.n_components <= X.shape[1] - 1
    assert m.explained_variance_ratio_.sum() >= 0.9 or m.n_components == X.shape[1] - 1


def test_missing_channels_keep_scores_comparable():
    X = latent(seed=2)
    m = PCAModel().fit(X[:2000])
    test = X[2000:]
    full = m.score(test)
    holed = test.copy()
    holed[np.random.default_rng(5).random(holed.shape) < 0.1] = np.nan
    partial = m.score(holed)
    ratio = np.nanmean(partial) / np.nanmean(full)
    assert 0.7 < ratio < 1.5  # residual-dof normalisation keeps scale comparable


def test_rows_without_residual_dof_are_nan():
    X = latent(c=4)
    m = PCAModel(max_components=2, var_target=1.0).fit(X)
    row = X[:1].copy()
    row[0, : 4 - m.n_components] = np.nan  # observed channels == k -> no residual dof
    assert np.isnan(m.score(row)[0])


def test_fit_validates_input():
    X = latent()
    with pytest.raises(ValueError):
        PCAModel().fit(np.where(np.arange(X.size).reshape(X.shape) == 5, np.nan, X))
    const = X.copy()
    const[:, 1] = 3.0
    with pytest.raises(ValueError):
        PCAModel().fit(const)
    with pytest.raises(ValueError):
        PCAModel().fit(X[:5])
    with pytest.raises(ValueError):
        PCAModel().fit(X[:, :1])
