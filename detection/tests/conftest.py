import numpy as np
import pytest

from sentinel_detection.align import ChannelSeries
from sentinel_detection.pipeline import DetectionConfig
from sentinel_detection.synthetic import make_subsystem


def series_from(sub, keep=None, subsystem=None):
    keep = np.ones(len(sub["times"]), dtype=bool) if keep is None else keep
    return [
        ChannelSeries(c, subsystem or sub["subsystem"], sub["times"][keep], sub["X"][keep, j])
        for j, c in enumerate(sub["channel_ids"])
    ]


@pytest.fixture(scope="module")
def sub():
    return make_subsystem(n_rows=4000, n_events=5, event_len=30, seed=11)


@pytest.fixture
def cfg():
    return DetectionConfig(bootstrap_replicates=200, seed=3)
