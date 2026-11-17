from backend.services.grid import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, generate_grid_cells


def test_ghmc_grid_has_120_cells_inside_the_box():
    cells = generate_grid_cells()
    assert len(cells) == 120
    assert len({cell["id"] for cell in cells}) == 120
    assert all(cell["cell_type"] == "grid" for cell in cells)
    assert all(LAT_MIN < cell["lat"] < LAT_MAX for cell in cells)
    assert all(LON_MIN < cell["lon"] < LON_MAX for cell in cells)
