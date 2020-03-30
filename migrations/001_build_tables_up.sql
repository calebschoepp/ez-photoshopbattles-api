CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name varchar(40) NOT NULL
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL,
    title varchar(200),
    post_url varchar(200) NOT NULL,
    cloudinary_secure_url varchar(200) NOT NULL,
    score INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE TABLE photoshops (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL,
    text varchar(200),
    score INTEGER,
    cloudinary_secure_url varchar(200) NOT NULL,
    cloudinary_public_id varchar(200) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format varchar(5) NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id)
);