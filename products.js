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
		)
	]
};

window.seasons = [season0, season10];
