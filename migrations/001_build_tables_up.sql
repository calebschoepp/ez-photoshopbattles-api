CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name varchar(40) NOT NULL
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL,
    text varchar(200),
    url varchar(200),
    score INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE TABLE photoshops (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL,
    text varchar(200),
    url varchar(200),
    score INTEGER,
    FOREIGN KEY (post_id) REFERENCES posts (id)
);
