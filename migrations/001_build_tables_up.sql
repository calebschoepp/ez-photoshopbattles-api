CREATE TABLE scraping_sessions (
    id SERIAL PRIMARY KEY,
    created_at timestamp default current_timestamp
)

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name varchar(40) NOT NULL UNIQUE
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    category_name varchar(40) NOT NULL,
    scraping_session_id INTEGER NOT NULL,
    title varchar(200),
    permalink varchar(200) NOT NULL,
    score INTEGER,
    FOREIGN KEY (category_name) REFERENCES categories (name),
    FOREIGN KEY (scraping_session_id) REFERENCES scraping_sessions (id) ON DELETE CASCADE
);

CREATE TABLE photos (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL,
    text varchar(200),
    score INTEGER,
    cloudinary_secure_url varchar(200) NOT NULL,
    cloudinary_public_id varchar(200) NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    format varchar(5) NOT NULL,
    is_original BOOLEAN NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
);

INSERT INTO categories (name) VALUES ('hot');
INSERT INTO categories (name) VALUES ('new');
INSERT INTO categories (name) VALUES ('top:now');
INSERT INTO categories (name) VALUES ('top:today');
INSERT INTO categories (name) VALUES ('top:week');
INSERT INTO categories (name) VALUES ('top:month');
INSERT INTO categories (name) VALUES ('top:year');
INSERT INTO categories (name) VALUES ('top:all');
INSERT INTO categories (name) VALUES ('rising');