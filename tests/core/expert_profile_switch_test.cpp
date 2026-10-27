// Request-boundary profile switching is a fixed-cache-shape projection.  CPU-only: no device is touched.
#include "strata/core/expert_cache.hpp"

#include <cstdio>
#include <string>
#include <utility>
#include <vector>

namespace {
int fails = 0;
void check(bool ok, const char* what) {
    if (!ok) {
        std::fprintf(stderr, "FAIL: %s\n", what);
        ++fails;
    }
}
}

int main() {
    using Pair = std::pair<int32_t, int32_t>;
    constexpr int64_t L = 3, E = 4;
    std::vector<int32_t> resident((size_t) (L * E), strata::core::kNotResident);
    resident[0] = 0; resident[1] = 1;
    resident[4] = 2;
    resident[8] = 3; resident[9] = 4; resident[10] = 5;

    const std::vector<Pair> ranked = {
        {0, 2}, {1, 3}, {2, 3}, {0, 1}, {2, 2}, {2, 1},
        {0, 0}, {0, 3}, {1, 0}, {1, 1}, {1, 2}, {2, 0},
    };
    std::vector<strata::core::ExpertProfileSwap> swaps;
    std::string err;
    check(strata::core::plan_expert_profile_switch(L, E, resident, ranked, swaps, err), "valid ranking plans");
    check(swaps.size() == 3, "one replacement in each layer");
    check(swaps.size() > 0 && swaps[0].layer == 0 && swaps[0].in == 2 && swaps[0].out == 0,
          "ranking order and same-layer victim are deterministic");
    check(swaps.size() > 1 && swaps[1].layer == 1 && swaps[1].in == 3 && swaps[1].out == 0,
          "second layer keeps its slot count");
    check(swaps.size() > 2 && swaps[2].layer == 2 && swaps[2].in == 3 && swaps[2].out == 0,
          "third layer keeps its slot count");

    const std::vector<Pair> current_first = {
        {0, 0}, {0, 1}, {1, 0}, {2, 0}, {2, 1}, {2, 2},
        {0, 2}, {0, 3}, {1, 1}, {1, 2}, {1, 3}, {2, 3},
    };
    check(strata::core::plan_expert_profile_switch(L, E, resident, current_first, swaps, err) && swaps.empty(),
          "already selected profile is a no-op");

    auto bad = ranked;
    bad.pop_back();
    check(!strata::core::plan_expert_profile_switch(L, E, resident, bad, swaps, err),
          "partial profile is refused");
    bad = ranked;
    bad.back() = bad.front();
    check(!strata::core::plan_expert_profile_switch(L, E, resident, bad, swaps, err),
          "duplicate pair is refused");
    bad = ranked;
    bad[0] = {(int32_t) L, 0};
    check(!strata::core::plan_expert_profile_switch(L, E, resident, bad, swaps, err),
          "out-of-range pair is refused");
    check(!strata::core::plan_expert_profile_switch(L, E, std::vector<int32_t>(1), ranked, swaps, err),
          "wrong residency geometry is refused");

    if (fails == 0) std::puts("expert_profile_switch_test: OK");
    return fails == 0 ? 0 : 1;
}
