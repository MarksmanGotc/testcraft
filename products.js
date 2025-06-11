let craftItem = {
        products: [
                ...season0.sets.flatMap(set =>
                        set.products.map(product => ({
                                ...product,
                                setName: set.setName,
                                season: season0.season
                        }))
                ),
                ...season10.sets.flatMap(set =>
                        set.products.map(product => ({
                                ...product,
                                setName: set.setName,
                                season: season10.season
                        }))
                ),
                ...season11.sets.flatMap(set =>
                        set.products.map(product => ({
                                ...product,
                                setName: set.setName,
                                season: season11.season
                        }))
                ),
                ...season12.sets.flatMap(set =>
                        set.products.map(product => ({
                                ...product,
                                setName: set.setName,
                                season: season12.season
                        }))
                )
        ]
};

// Assign a stable id for each product to disambiguate items with the same name
craftItem.products = craftItem.products.map((p, idx) => ({ ...p, id: idx }));

window.seasons = [season0, season10, season11, season12];
