#!/bin/sh

# Update this variable if you want to point to a locally built Git
GIT=git

$GIT --version

if ! $GIT blame -p -L465,465 Tree.tsx | grep '199ee75d1240ae72cd965f62aceeb301ab64e1bd 463 465 1'; then
	#  This shouldn't happen
	echo 'uhh, regular blame did not produce expected output';
	exit 1;
fi

if $GIT blame -p -L463,463 --reverse 199ee7.. Tree.tsx | grep '199ee75d1240ae72cd965f62aceeb301ab64e1bd 463 463 1'; then
	echo 'reproduced bug';
	exit 1;
else
	echo 'might have passed! please double check output';
fi
