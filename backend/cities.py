"""Canonical Karnataka cities list and frozen response payload for ``/api/cities``.

This module is the single source of truth for the set of Karnataka cities that
Eunoia onboarding supports (see the ``Karnataka_Cities`` glossary entry in
``requirements.md``). The constants are computed exactly once at import time so
that the ``GET /api/cities`` handler can return byte-identical JSON across
repeated calls (Requirement 10.4).

The values are intentionally immutable:

* :data:`KARNATAKA_CITIES_SORTED` is an alphabetised :class:`tuple` of the 19
  canonical city names. Tuples are hashable and immutable, so the constant
  cannot be mutated in place by other modules.
* :data:`CITIES_RESPONSE` is a :class:`types.MappingProxyType` view over the
  ``{"Karnataka": KARNATAKA_CITIES_SORTED}`` dictionary. The mapping proxy
  prevents callers from inserting, replacing, or deleting keys, while still
  exposing the standard :class:`Mapping` interface.

The ``/api/cities`` handler is expected to convert the inner tuple to a list
when serializing (e.g. ``{"Karnataka": list(KARNATAKA_CITIES_SORTED)}``) so the
response body is encoded as a JSON array.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Mapping, Tuple

# The 19 canonical Karnataka cities from the requirements glossary
# (Requirement 7.3). Order in this source list does not matter; the public
# constant below is derived via ``sorted`` to guarantee alphabetical ordering.
_KARNATAKA_CITIES: Tuple[str, ...] = (
    "Bengaluru",
    "Mysuru",
    "Mangaluru",
    "Hubballi",
    "Dharwad",
    "Belagavi",
    "Shivamogga",
    "Tumakuru",
    "Davanagere",
    "Ballari",
    "Udupi",
    "Kalaburagi",
    "Raichur",
    "Hassan",
    "Mandya",
    "Chikkamagaluru",
    "Kolar",
    "Vijayapura",
    "Bagalkot",
)

#: Alphabetised, frozen tuple of every Karnataka city Eunoia onboarding accepts.
#:
#: Computed at import time so successive calls to ``GET /api/cities`` return a
#: byte-identical body (Requirements 7.5, 10.1, 10.2, 10.4).
KARNATAKA_CITIES_SORTED: Tuple[str, ...] = tuple(sorted(_KARNATAKA_CITIES))

#: Frozen response payload for ``GET /api/cities``.
#:
#: ``MappingProxyType`` provides a read-only view over the underlying dict so
#: external modules cannot mutate the response shape at runtime. The handler
#: should still convert the inner tuple to a list when constructing the
#: ``JSONResponse`` so the body is encoded as a JSON array.
CITIES_RESPONSE: Mapping[str, Tuple[str, ...]] = MappingProxyType(
    {"Karnataka": KARNATAKA_CITIES_SORTED}
)


__all__ = ["KARNATAKA_CITIES_SORTED", "CITIES_RESPONSE"]
