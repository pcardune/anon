Anon
====

Installing Dependencies
-----------------------

Get node.  You can install it locally in your home directory and add it
to your shell's path with this code:

    mkdir node
    curl http://nodejs.org/dist/node-v0.4.1.tar.gz -O
    tar -xzvf node-v0.4.1.tar.gz
    cd node-v0.4.1
    ./configure --prefix=~/node
    make
    make install
    echo -e "\nexport PATH=~/node/bin:\$PATH\n" >> ~/.bashrc
    source ~/.bashrc

Now you need to install npm:

    curl http://npmjs.org/install.sh | sh

Get the code
------------

Checkout the code and run it!

    git clone git@github.com:pcardune/anon.git
    cd anon

Install the dependencies:

    npm link

Start the server:

    anon-serve

A quick note about configuration.  You can use the config-dev.js.in file
as a template for your own configuration file, which you can use like so:

    anon-serve -config config-dev.js